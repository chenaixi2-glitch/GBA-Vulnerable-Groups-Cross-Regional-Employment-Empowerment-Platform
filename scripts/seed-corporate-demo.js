'use strict';

/**
 * 企业端演示数据播种：demo 账号、随机岗位、HR 团队绩效、AI 面试看板。
 *
 * Usage:
 *   node scripts/seed-corporate-demo.js [baseUrl]
 *   node scripts/seed-corporate-demo.js http://127.0.0.1:3000
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const PASSWORD = 'demo123';

const DEMO_CORP = {
  username: 'corp_demo',
  email: 'corp@demo.com',
  password: PASSWORD,
  role: 'corporate',
  full_name: 'Demo HR Manager',
  phone: '13900001001',
};

const EXTRA_HR = [
  { username: 'corp_hr_amy', email: 'hr.amy@demo.com', full_name: 'Amy Chen', hr_title: 'Senior Recruiter' },
  { username: 'corp_hr_ben', email: 'hr.ben@demo.com', full_name: 'Ben Wong', hr_title: 'Talent Partner' },
];

const JOB_TEMPLATES = [
  { title: 'Senior Software Developer', department: 'Technology Department', location: 'Hong Kong', statusHint: 'active', salary_min: 25000, salary_max: 45000 },
  { title: 'Marketing Manager', department: 'Marketing Department', location: 'Shenzhen', statusHint: 'active', salary_min: 18000, salary_max: 32000 },
  { title: 'Financial Analyst', department: 'Finance Department', location: 'Macau', statusHint: 'active', salary_min: 15000, salary_max: 28000 },
  { title: 'Customer Service Representative', department: 'Customer Service Department', location: 'Guangzhou', statusHint: 'interviewing', salary_min: 8000, salary_max: 14000 },
  { title: 'Human Resources Manager', department: 'HR Department', location: 'Hong Kong', statusHint: 'closed', salary_min: 20000, salary_max: 35000 },
  { title: 'Data Analyst', department: 'Analytics Department', location: 'Dongguan', statusHint: 'active', salary_min: 12000, salary_max: 22000 },
  { title: 'UX Designer', department: 'Product Department', location: 'Shenzhen', statusHint: 'active', salary_min: 16000, salary_max: 30000 },
  { title: 'Operations Coordinator', department: 'Operations Department', location: 'Guangzhou', statusHint: 'interviewing', salary_min: 10000, salary_max: 18000 },
];

const CANDIDATES = [
  { username: 'demo_cand_alex', email: 'alex@demo.com', full_name: 'Alex Chen', age: 28, gender: 'male', disability_type: 'none', career_gap_years: 0, current_income: 12000 },
  { username: 'demo_cand_lily', email: 'lily@demo.com', full_name: 'Lily Wang', age: 42, gender: 'female', disability_type: 'hearing', career_gap_years: 3, current_income: 9000 },
  { username: 'demo_cand_sam', email: 'sam@demo.com', full_name: 'Sam Liu', age: 35, gender: 'male', disability_type: 'none', career_gap_years: 2, current_income: 15000 },
  { username: 'demo_cand_mia', email: 'mia@demo.com', full_name: 'Mia Ho', age: 50, gender: 'female', disability_type: 'physical', career_gap_years: 5, current_income: 8000 },
];

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

async function registerOrLogin(user, extra = {}) {
  const registerBody = { ...user, password: PASSWORD, role: user.role || 'individual', ...extra };
  const reg = await req('POST', '/api/auth/register', { body: registerBody });
  if (reg.status === 201 && reg.data?.data?.token) {
    return reg.data.data.token;
  }
  const login = await req('POST', '/api/auth/login', {
    body: { identifier: user.username, password: PASSWORD, expected_role: user.role || 'individual' },
    expectStatus: 200,
  });
  return login.data.data.token;
}

function jobPayload(template) {
  return {
    title: template.title,
    department: template.department,
    location: template.location,
    salary_min: template.salary_min,
    salary_max: template.salary_max,
    education: 'Bachelor',
    work_experience: '2+ years',
    description: `${template.title} role in ${template.location}. Inclusive hiring welcome — disabilities, career returners, and 45+ candidates encouraged to apply.`,
    skills: ['Communication', 'Teamwork', 'Problem solving'],
    target_criteria: {
      age_range: 'any',
      gender: 'any',
      disability: 'any',
      career_gap: 'any',
      prioritize_vulnerable: true,
    },
    interview_format: 'ai_only',
  };
}

async function createJob(token, template) {
  const { data } = await req('POST', '/api/jobs', {
    token,
    body: jobPayload(template),
    expectStatus: 201,
  });
  const job = data.data?.job || data.data;
  if (template.statusHint && template.statusHint !== 'active' && job?.id) {
    await req('PATCH', `/api/jobs/${job.id}/status`, {
      token,
      body: { status: template.statusHint },
      expectStatus: 200,
    });
    job.status = template.statusHint;
  }
  return job;
}

async function main() {
  console.log('\n=== 企业端演示数据播种 ===');
  console.log(`API: ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    throw new Error(`Node API 不可用 (${BASE})，请先 cd server && npm run dev`);
  }

  console.log('--- 1. 创建/登录 demo 企业账号 ---');
  const corpToken = await registerOrLogin(DEMO_CORP);
  await req('PUT', '/api/company/profile', {
    token: corpToken,
    body: {
      company_name: 'GBA Inclusive Tech Ltd',
      industry: 'Technology',
      description: 'Demo employer for GBA Platform corporate portal.',
      address: 'Hong Kong · Shenzhen · Guangzhou',
      is_friendly_employer: true,
      friendly_tags: ['disability_inclusive', 'career_returner', 'age_45_plus'],
    },
    expectStatus: 200,
  });
  console.log(`  ✅ corp_demo / ${PASSWORD}`);

  console.log('\n--- 2. 发布随机岗位 ---');
  const jobs = [];
  for (const template of JOB_TEMPLATES) {
    const job = await createJob(corpToken, template);
    jobs.push(job);
    console.log(`  ✅ ${job.title} (${job.location}, ${job.status || template.statusHint})`);
  }

  console.log('\n--- 3. 解锁 HR 绩效（捐款） ---');
  await req('POST', '/api/donations', {
    token: corpToken,
    body: { amount: 10, message: 'Corporate demo seed donation' },
    expectStatus: 201,
  });
  console.log('  ✅ Premium access unlocked');

  console.log('\n--- 4. 添加 HR 团队成员 ---');
  const teamRes = await req('GET', '/api/company/team', { token: corpToken, expectStatus: 200 });
  const inviteCode = teamRes.data?.data?.invite_code;
  if (!inviteCode) throw new Error('无法获取企业邀请码');

  for (const hr of EXTRA_HR) {
    const hrToken = await registerOrLogin(
      { ...hr, role: 'corporate', phone: '13900001002' },
      { org_invite_code: inviteCode, hr_title: hr.hr_title }
    );
    await createJob(hrToken, {
      title: `${hr.full_name.split(' ')[0]}'s Inclusive Hire`,
      department: 'HR Department',
      location: 'Shenzhen',
      statusHint: 'active',
      salary_min: 12000,
      salary_max: 20000,
    });
    console.log(`  ✅ ${hr.full_name} joined org & posted a job`);
  }

  console.log('\n--- 5. 创建候选人并投递 ---');
  const applications = [];
  for (let i = 0; i < CANDIDATES.length; i += 1) {
    const cand = CANDIDATES[i];
    const candToken = await registerOrLogin({ ...cand, role: 'individual', phone: `1380000${1000 + i}` });
    await req('PUT', '/api/resumes/me', {
      token: candToken,
      body: {
        content_json: {
          summary: `${cand.full_name} seeking inclusive employment in GBA.`,
          skills: ['JavaScript', 'Communication', 'Customer service'],
        },
        skills_text: 'JavaScript, Communication, Customer service',
      },
      expectStatus: 200,
    });
    const activeJobs = jobs.filter(function (j) { return j.status === 'active'; });
    const job = activeJobs[i % activeJobs.length] || jobs[0];
    const applyRes = await req('POST', `/api/jobs/${job.id}/apply`, {
      token: candToken,
      body: { cover_letter: `Interested in ${job.title}.` },
    });
    if (applyRes.status !== 201 && applyRes.status !== 409) {
      throw new Error(`POST /api/jobs/${job.id}/apply → ${applyRes.status}: ${JSON.stringify(applyRes.data).slice(0, 200)}`);
    }
    let appId = applyRes.data?.data?.id || applyRes.data?.data?.application?.id;
    if (!appId && applyRes.status === 409) {
      const mine = await req('GET', '/api/jobs/applications/me', { token: candToken, expectStatus: 200 });
      const found = (mine.data?.data?.applications || []).find(function (a) { return Number(a.job_id) === Number(job.id); });
      appId = found?.id;
    }
    if (!appId) throw new Error(`No application id for ${cand.full_name} on job ${job.id}`);
    applications.push({ appId, candToken, cand, job });
    console.log(`  ✅ ${cand.full_name} → ${job.title}`);
  }

  console.log('\n--- 6. 创建 AI 面试看板数据 ---');
  const boardPlans = [
    { index: 0, action: 'invited' },
    { index: 1, action: 'in_progress' },
    { index: 2, action: 'completed', score: 82 },
    { index: 3, action: 'completed', score: 91 },
  ];

  for (const plan of boardPlans) {
    const { appId, candToken, cand, job } = applications[plan.index];
    const inviteRes = await req('POST', `/api/jobs/applications/${appId}/interview-invite`, {
      token: corpToken,
      body: {},
      expectStatus: 201,
    });
    const invite = inviteRes.data?.data?.invite;
    if (!invite?.invite_token) continue;

    if (plan.action === 'in_progress' || plan.action === 'completed') {
      await req('POST', `/api/interview-invites/token/${invite.invite_token}/start`, {
        token: candToken,
        body: {},
        expectStatus: 200,
      });
    }
    if (plan.action === 'completed') {
      await req('POST', `/api/interview-invites/token/${invite.invite_token}/complete`, {
        token: candToken,
        body: {
          overall_score: plan.score,
          category_scores: { communication: plan.score - 5, technical: plan.score },
          debrief_summary: 'Demo assessment completed.',
        },
        expectStatus: 200,
      });
    }
    console.log(`  ✅ ${cand.full_name} — ${plan.action}${plan.score ? ` (${plan.score})` : ''} @ ${job.title}`);
  }

  const teamStats = await req('GET', '/api/stats/corporate/team', { token: corpToken, expectStatus: 200 });
  const hrCount = (teamStats.data?.data?.hr_performance || []).length;
  const mineJobs = await req('GET', '/api/jobs?mine=true&source=internal&pageSize=20', { token: corpToken, expectStatus: 200 });
  const jobCount = mineJobs.data?.data?.pagination?.total || 0;
  const board = await req('GET', '/api/interview-invites/board?status=all', { token: corpToken, expectStatus: 200 });
  const cols = board.data?.data?.columns || {};

  console.log('\n=== 播种完成 ===');
  console.log(`企业账号: ${DEMO_CORP.username} / ${PASSWORD}`);
  console.log(`邮箱登录: ${DEMO_CORP.email} / ${PASSWORD}`);
  console.log(`My Jobs 岗位: ${jobCount} 条（corp_demo 名下）`);
  console.log(`HR 团队成员: ${hrCount} 人`);
  console.log(`面试看板: invited=${(cols.invited || []).length}, in_progress=${(cols.in_progress || []).length}, completed=${(cols.completed || []).length}`);
  console.log('\n请先用企业账号登录 corporate/auth.html，再访问 portal.html#jobs\n');
}

main().catch((err) => {
  console.error('\n播种失败:', err.message);
  process.exit(1);
});
