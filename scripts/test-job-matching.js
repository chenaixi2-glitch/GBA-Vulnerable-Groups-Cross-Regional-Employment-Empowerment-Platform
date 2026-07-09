'use strict';

/**
 * 岗位匹配测试：对照 fixtures 中的期望岗位，验证评分与硬性筛选。
 *
 * Usage:
 *   node scripts/test-job-matching.js --offline          # 无需 API，本地算分
 *   node scripts/test-job-matching.js [baseUrl]            # 调用 /api/jobs/matched
 *   node scripts/test-job-matching.js http://127.0.0.1:3000
 */

const path = require('path');
const fixtures = require(path.join(__dirname, '..', 'test-data', 'matching', 'fixtures.json'));

const OFFLINE = process.argv.includes('--offline');
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:3000';
const PASSWORD = fixtures.password || 'MatchTest123';

const { scoreJobResume } = require(path.join(__dirname, '..', 'server', 'src', 'services', 'match.service'));
const {
  userMatchesJobCriteria,
  inferGroupTypes,
  buildJobTargetingFromCriteria,
} = require(path.join(__dirname, '..', 'server', 'src', 'constants', 'groupTypes'));

function flattenJobs() {
  const jobs = [];
  for (const company of fixtures.companies) {
    for (const job of company.jobs) {
      const targeting = buildJobTargetingFromCriteria(job.target_criteria || {});
      jobs.push({
        ...job,
        company_name: company.company_name,
        source: 'internal',
        target_criteria: targeting.target_criteria,
        target_group_types: targeting.target_group_types,
        vulnerable_group_friendly: targeting.vulnerable_group_friendly === 1,
      });
    }
  }
  return jobs;
}

function fixtureJobTitles() {
  return new Set(flattenJobs().map((j) => j.title));
}

function filterToFixtureJobs(scored) {
  const titles = fixtureJobTitles();
  return scored.filter((s) => titles.has(s.title));
}

function matchOffline(candidate) {
  const user = candidate.user;
  const resume = {
    content_json: candidate.resume.content_json,
    skills_text: candidate.resume.skills_text,
  };
  const allJobs = flattenJobs();

  const visible = allJobs.filter((job) =>
    userMatchesJobCriteria(user, job.target_criteria, {
      source: job.source,
      vulnerable_group_friendly: job.vulnerable_group_friendly,
    })
  );

  const scored = visible
    .map((job) => {
      const { score, reasons } = scoreJobResume(job, resume);
      return { title: job.title, company: job.company_name, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const blocked = allJobs
    .filter((job) => !visible.some((v) => v.title === job.title))
    .map((j) => j.title);

  return {
    group_types: inferGroupTypes(user),
    scored,
    blocked,
  };
}

async function req(method, urlPath, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function login(username) {
  const { status, data } = await req('POST', '/api/auth/login', {
    body: { identifier: username, password: PASSWORD },
  });
  if (status !== 200 || !data?.data?.token) {
    throw new Error(`登录失败: ${username}（请先运行 seed-matching-testdata.js）`);
  }
  return data.data.token;
}

async function matchOnline(candidate) {
  const token = await login(candidate.user.username);
  const { data } = await req('GET', '/api/jobs/matched?source=internal', { token });
  const jobs = data?.data?.jobs || [];
  const fixtureTitles = fixtureJobTitles();
  const fixtureOnly = jobs.filter((j) => fixtureTitles.has(j.title));
  const returnedTitles = new Set(fixtureOnly.map((j) => j.title));
  const blocked = [...fixtureTitles].filter((t) => !returnedTitles.has(t));

  return {
    group_types: data?.data?.user_group_types || [],
    scored: fixtureOnly.map((j) => ({
      title: j.title,
      company: j.company_name,
      score: j.matchScore,
      reasons: j.matchReasons || [],
    })),
    blocked,
  };
}

function assertCandidate(candidate, result) {
  const errors = [];
  const scoredMap = Object.fromEntries(result.scored.map((s) => [s.title, s.score]));
  const topTitle = result.scored[0]?.title;

  for (const expected of candidate.expected_top_jobs || []) {
    if (!(expected in scoredMap)) {
      errors.push(`期望可见岗位「${expected}」未出现在匹配列表（可能被硬性条件过滤）`);
    } else if (scoredMap[expected] < (candidate.min_match_score || 40)) {
      errors.push(`「${expected}」得分 ${scoredMap[expected]} 低于阈值 ${candidate.min_match_score || 40}`);
    }
  }

  const top1Candidates = candidate.expected_top1_jobs || candidate.expected_top_jobs?.slice(0, 2) || [];
  if (top1Candidates.length && topTitle && !top1Candidates.includes(topTitle)) {
    errors.push(`Top1 为「${topTitle}」，期望为: ${top1Candidates.join(' 或 ')}`);
  }

  for (const blocked of candidate.expected_filtered_jobs || []) {
    if (blocked in scoredMap) {
      errors.push(`期望被硬性条件过滤的岗位「${blocked}」仍出现在列表（得分 ${scoredMap[blocked]}）`);
    }
  }

  return errors;
}

async function main() {
  const mode = OFFLINE ? '离线算分' : `在线 API (${BASE})`;
  console.log(`\n=== 岗位匹配测试 [${mode}] ===\n`);

  if (!OFFLINE) {
    const health = await req('GET', '/health');
    if (health.status !== 200) {
      console.error('Node API 未启动。可改用: node scripts/test-job-matching.js --offline');
      process.exit(1);
    }
  }

  let passed = 0;
  let failed = 0;
  const allJobs = flattenJobs();

  console.log(`测试集: ${fixtures.companies.length} 企业 / ${allJobs.length} 岗位 / ${fixtures.candidates.length} 简历\n`);

  for (const candidate of fixtures.candidates) {
    const result = OFFLINE ? matchOffline(candidate) : await matchOnline(candidate);
    const errors = assertCandidate(candidate, result);

    if (errors.length) {
      failed += 1;
      console.log(`❌ ${candidate.label}`);
      errors.forEach((e) => console.log(`   · ${e}`));
    } else {
      passed += 1;
      console.log(`✅ ${candidate.label}`);
    }

    const top3 = result.scored.slice(0, 3).map((s) => `${s.title}(${s.score})`).join(' > ');
    console.log(`   人群: [${(result.group_types || []).join('、') || '无'}]`);
    console.log(`   Top3: ${top3 || '无匹配岗位'}`);
    if (result.blocked.length) {
      const sample = result.blocked.slice(0, 3).join('、');
      console.log(`   已过滤: ${sample}${result.blocked.length > 3 ? '…' : ''}`);
    }
    console.log('');
  }

  console.log(`=== 结果: ${passed} 通过, ${failed} 失败 / ${fixtures.candidates.length} 候选人 ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
