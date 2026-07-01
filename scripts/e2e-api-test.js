'use strict';

/**
 * End-to-end API smoke test for GBA Platform Node backend.
 * Usage: node scripts/e2e-api-test.js [baseUrl]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const STATIC_BASE = process.argv[3] || 'http://127.0.0.1:8080';

const ts = Date.now();
const individualUser = {
  username: `ind_${ts}`,
  email: `ind_${ts}@test.local`,
  password: 'Test123456',
  role: 'individual',
  full_name: 'Test Individual',
  phone: '13800000001',
  age: 35,
  gender: 'female',
  disability_type: 'none',
  career_gap_years: 2,
  current_income: 6000,
};
const corporateUser = {
  username: `corp_${ts}`,
  email: `corp_${ts}@test.local`,
  password: 'Test123456',
  role: 'corporate',
  full_name: 'Test Corp HR',
  phone: '13800000002',
};

const results = [];

function log(icon, name, detail) {
  const line = detail ? `${icon} ${name} — ${detail}` : `${icon} ${name}`;
  console.log(line);
  results.push({ icon, name, detail });
}

async function req(method, path, { body, token, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, got ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    log('✅', name);
    return true;
  } catch (err) {
    log('❌', name, err.message);
    return false;
  }
}

async function main() {
  console.log(`\n=== GBA Platform E2E API Test ===`);
  console.log(`API: ${BASE}  |  Static: ${STATIC_BASE}\n`);

  let individualToken = '';
  let corporateToken = '';
  let jobId = null;
  let applicationId = null;

  // --- Public endpoints ---
  await test('GET /health', async () => {
    const { status, data } = await req('GET', '/health', { expectStatus: 200 });
    if (!data || data.status !== 'ok') throw new Error(JSON.stringify(data));
  });

  await test('GET /api', async () => {
    const { data } = await req('GET', '/api', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/auth/group-types', async () => {
    const { data } = await req('GET', '/api/auth/group-types', { expectStatus: 200 });
    if (!data.success || !data.data?.group_types) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/stats/home', async () => {
    const { data } = await req('GET', '/api/stats/home', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs (public list)', async () => {
    const { data } = await req('GET', '/api/jobs?page=1&pageSize=5', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/company/friendly', async () => {
    const { data } = await req('GET', '/api/company/friendly', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/donations/stats', async () => {
    const { data } = await req('GET', '/api/donations/stats', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/donations/legal-services', async () => {
    const { data } = await req('GET', '/api/donations/legal-services', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/legal-aid/meta', async () => {
    const { data } = await req('GET', '/api/legal-aid/meta', { expectStatus: 200 });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Auth: individual ---
  await test('POST /api/auth/register (individual)', async () => {
    const { data } = await req('POST', '/api/auth/register', {
      body: individualUser,
      expectStatus: 201,
    });
    if (!data.data?.token) throw new Error(JSON.stringify(data));
    individualToken = data.data.token;
  });

  await test('GET /api/auth/me (individual)', async () => {
    const { data } = await req('GET', '/api/auth/me', { token: individualToken, expectStatus: 200 });
    if (data.data?.user?.role !== 'individual') throw new Error(JSON.stringify(data));
  });

  await test('PATCH /api/auth/profile (individual)', async () => {
    const { data } = await req('PATCH', '/api/auth/profile', {
      token: individualToken,
      body: { full_name: 'Updated Individual', age: 36 },
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Auth: corporate ---
  await test('POST /api/auth/register (corporate)', async () => {
    const { data } = await req('POST', '/api/auth/register', {
      body: corporateUser,
      expectStatus: 201,
    });
    if (!data.data?.token) throw new Error(JSON.stringify(data));
    corporateToken = data.data.token;
  });

  await test('POST /api/auth/login (corporate)', async () => {
    const { data } = await req('POST', '/api/auth/login', {
      body: { identifier: corporateUser.username, password: corporateUser.password },
      expectStatus: 200,
    });
    if (!data.data?.token) throw new Error(JSON.stringify(data));
    corporateToken = data.data.token;
  });

  // --- Corporate: company profile & job ---
  await test('PUT /api/company/profile', async () => {
    const { data } = await req('PUT', '/api/company/profile', {
      token: corporateToken,
      body: {
        company_name: `Test Co ${ts}`,
        industry: 'Technology',
        description: 'E2E test company',
        is_friendly_employer: true,
        friendly_tags: ['disability_inclusive'],
      },
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/company/profile', async () => {
    const { data } = await req('GET', '/api/company/profile', {
      token: corporateToken,
      expectStatus: 200,
    });
    if (!data.data?.profile?.company_name) throw new Error(JSON.stringify(data));
  });

  await test('POST /api/jobs (create)', async () => {
    const { data } = await req('POST', '/api/jobs', {
      token: corporateToken,
      body: {
        title: `E2E Job ${ts}`,
        department: 'Engineering',
        location: 'Shenzhen',
        salary_min: 8000,
        salary_max: 15000,
        target_criteria: {
          age_range: 'any',
          gender: 'any',
          disability: 'open',
          career_gap: 'any',
          prioritize_vulnerable: true,
        },
        skills: ['JavaScript', 'Node.js'],
      },
      expectStatus: 201,
    });
    jobId = data.data?.job?.id || data.data?.id;
    if (!jobId) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs/:id', async () => {
    const { data } = await req('GET', `/api/jobs/${jobId}`, { expectStatus: 200 });
    if (!data.data?.title) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs?mine=true (corporate)', async () => {
    const { data } = await req('GET', '/api/jobs?mine=true', {
      token: corporateToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/stats/corporate', async () => {
    const { data } = await req('GET', '/api/stats/corporate', {
      token: corporateToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Individual: resume & apply ---
  await test('PUT /api/resumes/me', async () => {
    const { data } = await req('PUT', '/api/resumes/me', {
      token: individualToken,
      body: {
        content_json: {
          summary: 'Experienced developer seeking inclusive workplace',
          skills: ['JavaScript', 'Node.js', 'React'],
          experience: [{ title: 'Developer', years: 3 }],
        },
      },
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/resumes/me', async () => {
    const { data } = await req('GET', '/api/resumes/me', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.data) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs/matched', async () => {
    const { data } = await req('GET', '/api/jobs/matched', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('POST /api/jobs/:id/apply', async () => {
    const { data } = await req('POST', `/api/jobs/${jobId}/apply`, {
      token: individualToken,
      body: { cover_letter: 'I am interested in this inclusive role.' },
      expectStatus: 201,
    });
    applicationId = data.data?.id;
    if (!applicationId) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs/applications/me', async () => {
    const { data } = await req('GET', '/api/jobs/applications/me', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/jobs/:id/applications (corporate)', async () => {
    const { data } = await req('GET', `/api/jobs/${jobId}/applications`, {
      token: corporateToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('PATCH application status (corporate)', async () => {
    const { data } = await req('PATCH', `/api/jobs/applications/${applicationId}/status`, {
      token: corporateToken,
      body: { status: 'reviewing' },
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/stats/individual', async () => {
    const { data } = await req('GET', '/api/stats/individual', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Donations (non-vulnerable corporate user can donate) ---
  await test('POST /api/donations (corporate)', async () => {
    const { data } = await req('POST', '/api/donations', {
      token: corporateToken,
      body: { amount: 10, message: 'E2E test donation' },
      expectStatus: 201,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/donations/me', async () => {
    const { data } = await req('GET', '/api/donations/me', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/donations/access', async () => {
    const { data } = await req('GET', '/api/donations/access', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Legal aid ---
  let legalAidId = null;
  await test('POST /api/legal-aid/requests', async () => {
    const { data } = await req('POST', '/api/legal-aid/requests', {
      token: individualToken,
      body: {
        category: 'labor_rights',
        title: 'E2E legal aid request',
        description: 'Need help understanding cross-border employment contract terms for GBA region.',
        contact_phone: '13800000001',
        prefer_platform: true,
      },
      expectStatus: 201,
    });
    legalAidId = data.data?.id;
    if (!legalAidId) throw new Error(JSON.stringify(data));
  });

  await test('GET /api/legal-aid/requests/mine', async () => {
    const { data } = await req('GET', '/api/legal-aid/requests/mine', {
      token: individualToken,
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  // --- Job lifecycle cleanup ---
  await test('PATCH /api/jobs/:id/status (close)', async () => {
    const { data } = await req('PATCH', `/api/jobs/${jobId}/status`, {
      token: corporateToken,
      body: { status: 'closed' },
      expectStatus: 200,
    });
    if (!data.success) throw new Error(JSON.stringify(data));
  });

  await test('POST /api/jobs/:id/clone', async () => {
    const { data } = await req('POST', `/api/jobs/${jobId}/clone`, {
      token: corporateToken,
      expectStatus: 201,
    });
    if (!data.data?.id) throw new Error(JSON.stringify(data));
  });

  // --- Static pages ---
  const pages = [
    '/',
    '/individual/',
    '/individual/auth.html',
    '/individual/portal.html',
    '/individual/demo-jobs-database.html',
    '/individual/apply.html',
    '/individual/my-applications.html',
    '/individual/profile.html',
    '/individual/donation-legal.html',
    '/individual/friendly-employers.html',
    '/corporate/',
    '/corporate/auth.html',
    '/corporate/portal.html',
    '/corporate/post-job.html',
    '/corporate/company-profile.html',
    '/corporate/donation-legal.html',
  ];

  for (const page of pages) {
    await test(`Static page ${page}`, async () => {
      const res = await fetch(`${STATIC_BASE}${page}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
        throw new Error('Not valid HTML');
      }
    });
  }

  const passed = results.filter((r) => r.icon === '✅').length;
  const failed = results.filter((r) => r.icon === '❌').length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${results.length} total ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
