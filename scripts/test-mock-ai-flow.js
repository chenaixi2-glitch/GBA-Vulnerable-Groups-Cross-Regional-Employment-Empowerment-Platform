'use strict';

/**
 * 使用 test-data/alex-chen 中的 Mock 数据，离线验证演示链路。
 * 不依赖 Python 后端 / LLM。真实 API 集成测试请用 backend/test_api.py。
 *
 * Usage: node scripts/test-mock-ai-flow.js
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const td = require(path.join(ROOT, 'test-data', 'index.js'));
const API_CLIENT_PATH = path.join(ROOT, 'individual', 'assets', 'js', 'api-client.js');

function loadMockService() {
  const bundlePath = path.join(ROOT, 'test-data', 'browser-bundle.js');
  const code = fs.readFileSync(API_CLIENT_PATH, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
    },
    window: {},
    globalThis: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    axios: {
      create: () => ({
        post: async () => ({ data: {} }),
        get: async () => ({ data: {} }),
        interceptors: { request: { use: () => {} } },
      }),
      get: async () => ({ data: { status: 'ok' } }),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: bundlePath });
  vm.runInContext(code, sandbox, { filename: API_CLIENT_PATH });
  const { MockAPIService } = sandbox.module.exports;
  if (!MockAPIService) {
    throw new Error('MockAPIService not exported from api-client.js');
  }
  return new MockAPIService();
}

const SAMPLE_PROFILE_TEXT = td.alexChen.profileText();
const SAMPLE_JD_TEXT = td.alexChen.jdText();

const results = [];

function log(ok, name, detail) {
  const icon = ok ? '✅' : '❌';
  const line = detail ? `${icon} ${name} — ${detail}` : `${icon} ${name}`;
  console.log(line);
  results.push(ok);
}

async function main() {
  console.log('\n=== Mock AI Flow Test (Alex Chen fixtures from test-data/) ===\n');

  const mock = loadMockService();
  const sessionId = `sess_mock_${Date.now()}`;

  let res = await mock.chat(sessionId, SAMPLE_PROFILE_TEXT, []);
  log(res.triggered_agents.includes('profile_agent'), 'Profile upload → profile_agent', JSON.stringify(res.triggered_agents));
  log(res.candidate_profile?.profile_basic?.name === 'Alex Chen', 'Profile name = Alex Chen', res.candidate_profile?.profile_basic?.name);

  res = await mock.chat(sessionId, SAMPLE_JD_TEXT, []);
  log(res.triggered_agents.includes('jd_agent'), 'JD submit → jd_agent');
  log(Boolean(res.job?.title), 'Job title parsed', res.job?.title);

  res = await mock.chat(sessionId, 'Please generate a customized resume based on my experience and target position', []);
  log(
    res.triggered_agents.includes('content_agent') && res.triggered_agents.includes('render_agent'),
    'Resume generate → content + render',
    JSON.stringify(res.triggered_agents)
  );
  log(Boolean(res.resume_html?.html?.includes('Alex Chen')), 'Resume HTML has Alex Chen');
  log((res.resume_html?.html?.length || 0) > 200, 'Resume HTML length', `${res.resume_html?.html?.length || 0} chars`);

  res = await mock.chat(
    sessionId,
    'Please generate interview questions. Target role: Customer Service Specialist. Interview tone: professional.',
    []
  );
  log(res.triggered_agents.includes('interview_agent'), 'Interview → interview_agent');
  log((res.interview_qa?.length || 0) >= 3, 'Interview questions count', String(res.interview_qa?.length));

  res = await mock.chat(sessionId, 'Evaluate my answer: I handled 80+ daily inquiries and improved resolution by 18%.', []);
  log(res.triggered_agents.includes('answer_evaluation_agent'), 'Answer evaluation agent');
  log(Boolean(res.score), 'Score returned', String(res.score));

  const interactive = await mock.startInteractiveInterview(sessionId, 'professional', 'Customer Service Specialist', 'ecommerce', 10);
  log(interactive.interactive_interview?.status === 'active', 'Interactive interview started');
  log((interactive.interactive_interview?.turns?.length || 0) >= 1, 'Opening turn present');

  const turn = await mock.submitInteractiveTurn(sessionId, 'I have cross-border CS experience with measurable SLA improvements.');
  log((turn.interactive_interview?.turns?.length || 0) > 2, 'Turn adds feedback + follow-up');

  const end = await mock.endInteractiveInterview(sessionId, true);
  log(Boolean(end.interactive_interview?.debrief?.overall_score), 'Debrief score', String(end.interactive_interview?.debrief?.overall_score));

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${results.length} total ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
