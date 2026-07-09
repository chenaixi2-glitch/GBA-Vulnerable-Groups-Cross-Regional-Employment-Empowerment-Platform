'use strict';

/**
 * 将 test-data/matching/fixtures.json 写入运行中的 Node API（企业 + 岗位 + 测试用户简历）。
 *
 * Usage:
 *   node scripts/seed-matching-testdata.js [baseUrl]
 *   node scripts/seed-matching-testdata.js http://127.0.0.1:3000
 */

const path = require('path');
const fixtures = require(path.join(__dirname, '..', 'test-data', 'matching', 'fixtures.json'));

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const PASSWORD = fixtures.password || 'MatchTest123';

async function req(method, urlPath, { body, token, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return { status: res.status, data };
}

async function registerOrLogin(user) {
  const registerBody = { ...user, password: PASSWORD, role: user.role || 'individual' };
  const reg = await req('POST', '/api/auth/register', { body: registerBody });
  if (reg.status === 201 && reg.data?.data?.token) {
    return reg.data.data.token;
  }
  const login = await req('POST', '/api/auth/login', {
    body: { identifier: user.username, password: PASSWORD },
    expectStatus: 200,
  });
  return login.data.data.token;
}

async function seedCompanies() {
  const createdJobs = [];
  for (const company of fixtures.companies) {
    const corpUser = {
      username: `corp_${company.id}`,
      email: `corp_${company.id}@test.gba.local`,
      full_name: `${company.company_name} HR`,
      phone: '13900000000',
      role: 'corporate',
    };
    const token = await registerOrLogin(corpUser);

    await req('PUT', '/api/company/profile', {
      token,
      body: {
        company_name: company.company_name,
        industry: company.industry,
        description: company.description,
        address: company.address,
        is_friendly_employer: company.is_friendly_employer,
        friendly_tags: company.friendly_tags || [],
      },
      expectStatus: 200,
    });

    for (const job of company.jobs) {
      const { data } = await req('POST', '/api/jobs', {
        token,
        body: {
          title: job.title,
          department: job.department,
          location: job.location,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          education: job.education,
          work_experience: job.work_experience,
          description: job.description,
          skills: job.skills,
          target_criteria: job.target_criteria,
        },
        expectStatus: 201,
      });
      const jobId = data.data?.job?.id || data.data?.id;
      createdJobs.push({
        id: jobId,
        title: job.title,
        company: company.company_name,
      });
      console.log(`  ✅ 岗位: ${company.company_name} — ${job.title} (id=${jobId})`);
    }
  }
  return createdJobs;
}

async function seedCandidates() {
  const results = [];
  for (const candidate of fixtures.candidates) {
    const user = { ...candidate.user, role: 'individual' };
    const token = await registerOrLogin(user);

    await req('PUT', '/api/resumes/me', {
      token,
      body: {
        content_json: candidate.resume.content_json,
        skills_text: candidate.resume.skills_text,
      },
      expectStatus: 200,
    });

    const { data } = await req('GET', '/api/jobs/matched?source=internal', {
      token,
      expectStatus: 200,
    });

    results.push({
      label: candidate.label,
      username: user.username,
      group_types: data.data?.user_group_types || [],
      has_resume: data.data?.has_resume,
      top_matches: (data.data?.jobs || []).slice(0, 5).map((j) => ({
        title: j.title,
        company: j.company_name,
        score: j.matchScore,
      })),
    });
    console.log(`  ✅ 简历: ${candidate.label} (${user.username})`);
  }
  return results;
}

async function main() {
  console.log(`\n=== 岗位匹配测试数据播种 ===`);
  console.log(`API: ${BASE}`);
  console.log(`企业: ${fixtures.companies.length} 家，岗位: ${fixtures.companies.reduce((n, c) => n + c.jobs.length, 0)} 个`);
  console.log(`候选人: ${fixtures.candidates.length} 份简历\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    throw new Error(`Node API 不可用 (${BASE})，请先启动 server`);
  }

  console.log('--- 创建企业与岗位 ---');
  const jobs = await seedCompanies();

  console.log('\n--- 创建候选人并上传简历 ---');
  const candidates = await seedCandidates();

  console.log('\n--- 播种摘要 ---');
  console.log(`共创建/更新 ${jobs.length} 个岗位`);
  for (const c of candidates) {
    const top = c.top_matches.map((m) => `${m.title}(${m.score})`).join(', ') || '无';
    console.log(`  ${c.label}: 人群[${(c.group_types || []).join('、')}] → ${top}`);
  }

  console.log('\n运行匹配验证: node scripts/test-job-matching.js');
  console.log('（离线评分）: node scripts/test-job-matching.js --offline\n');
}

main().catch((err) => {
  console.error('播种失败:', err.message);
  process.exit(1);
});
