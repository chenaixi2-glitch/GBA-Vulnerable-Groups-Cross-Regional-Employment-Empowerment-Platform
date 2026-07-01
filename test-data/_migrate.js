'use strict';

/**
 * One-time / repeatable migration: extract scattered test fixtures into test-data/.
 * Usage: node test-data/_migrate.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TD = path.join(ROOT, 'test-data');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(rel, data) {
  const fp = path.join(TD, rel);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('  wrote', rel);
}

function writeText(rel, text) {
  const fp = path.join(TD, rel);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, text.replace(/^\n/, ''), 'utf8');
  console.log('  wrote', rel);
}

function extractBalanced(source, openIdx) {
  const open = source[openIdx];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error('bad open at ' + openIdx);
  let depth = 0;
  let inStr = false;
  let strQuote = '';
  let escape = false;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === strQuote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strQuote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  throw new Error('unbalanced from ' + openIdx);
}

function evalJsLiteral(literal) {
  return vm.runInNewContext('(' + literal + ')', {});
}

function extractFromMockApi() {
  const src = fs.readFileSync(path.join(ROOT, 'mock-api.js'), 'utf8');

  const jobsMarker = 'const mockJobs = ';
  const jobsStart = src.indexOf(jobsMarker);
  const jobsLit = extractBalanced(src, jobsStart + jobsMarker.length);
  writeJson('mock/jobs.json', evalJsLiteral(jobsLit));

  const qMarker = 'const mockQuestions = ';
  const qStart = src.indexOf(qMarker);
  const qLit = extractBalanced(src, qStart + qMarker.length);
  writeJson('mock/interview-questions.json', evalJsLiteral(qLit));

  const policyMarker = 'const policySynonyms = ';
  const policyStart = src.indexOf(policyMarker);
  const policyLit = extractBalanced(src, policyStart + policyMarker.length);
  writeJson('mock/policy-qa.json', evalJsLiteral(policyLit));

  const aliasMarker = 'const learningPathJobAliases = ';
  const aliasStart = src.indexOf(aliasMarker);
  const aliasLit = extractBalanced(src, aliasStart + aliasMarker.length);
  writeJson('mock/learning-path-aliases.json', evalJsLiteral(aliasLit));

  const pathsMarker = 'const learningPaths = ';
  const pathsStart = src.indexOf(pathsMarker);
  const pathsLit = extractBalanced(src, pathsStart + pathsMarker.length);
  writeJson('mock/learning-paths.json', evalJsLiteral(pathsLit));
}

async function extractFromApiClient() {
  const src = fs.readFileSync(path.join(ROOT, 'individual', 'assets', 'js', 'api-client.js'), 'utf8');

  const enMarker = 'const MOCK_SAMPLE_RESUME_HTML = `';
  const enStart = src.indexOf(enMarker);
  const enEnd = src.indexOf('`;', enStart + enMarker.length);
  const resumeEn = src.slice(enStart + enMarker.length, enEnd);
  writeText('alex-chen/resume-en.html', resumeEn);

  const zhMarker = "const html = isEn ? MOCK_SAMPLE_RESUME_HTML : `";
  const zhStart = src.indexOf(zhMarker);
  const zhEnd = src.indexOf('`;', zhStart + zhMarker.length);
  const resumeZh = src.slice(zhStart + zhMarker.length, zhEnd);
  writeText('alex-chen/resume-zh.html', resumeZh);

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    localStorage: { _data: {}, getItem() { return null; }, setItem() {}, removeItem() {} },
    window: {},
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
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const Mock = sandbox.module.exports.MockAPIService;
  const mock = new Mock();

  writeJson('alex-chen/mock.json', {
    candidateProfile: mock.candidateProfilePayload(),
    profilePayload: mock.profilePayload(),
    gaps: mock.gapPayload(),
    interviewSets: {
      professional: mock.interviewPayload('professional'),
      friendly: mock.interviewPayload('friendly'),
      cold: mock.interviewPayload('cold'),
    },
    interactiveFollowUps: mock._mockInteractiveFollowUps(),
    interactiveInterviewHistory: (await mock.getInteractiveInterviewHistory()).records,
    learningPathHistory: (await mock.getLearningPathHistory()).records,
    languageChecklists: {
      en: mock.buildMockChecklist('en'),
      zh: mock.buildMockChecklist('zh'),
    },
  });
}

async function main() {
  console.log('Migrating test data into test-data/...\n');

  ensureDir(path.join(TD, 'golden'));
  const goldenSrc = path.join(ROOT, 'backend', 'tests', 'golden', 'answer_evaluation_golden.json');
  if (fs.existsSync(goldenSrc)) {
    fs.copyFileSync(goldenSrc, path.join(TD, 'golden', 'answer_evaluation_golden.json'));
    console.log('  copied golden/answer_evaluation_golden.json');
  }

  writeText('senior-fullstack/profile.txt', `John Doe
Email: john.doe@example.com
Phone: +86 138-0000-0000

EXPERIENCE:
Senior Software Engineer at Tech Corp (2020-Present)
- Led development of microservices architecture
- Implemented CI/CD pipelines using Docker and Kubernetes
- Mentored junior developers and conducted code reviews

SKILLS:
Python, JavaScript, React, Node.js, Docker, Kubernetes, AWS, Git

EDUCATION:
Bachelor of Science in Computer Science
University of Technology, 2019`);

  writeText('senior-fullstack/jd.txt', `Job Title: Senior Full Stack Developer

Requirements:
- 5+ years of experience in web development
- Strong proficiency in Python and JavaScript
- Experience with React and Node.js
- Knowledge of containerization (Docker, Kubernetes)
- Cloud platform experience (AWS/Azure/GCP)
- Excellent problem-solving skills
- Team leadership experience

Responsibilities:
- Design and implement scalable web applications
- Lead technical architecture decisions
- Mentor junior developers
- Collaborate with cross-functional teams`);

  writeJson('senior-fullstack/messages.json', {
    generateResume: 'Please generate an optimized resume tailored for this Senior Full Stack Developer position',
    interviewStart:
      'Generate interview questions for a Senior Software Engineer position in the technology industry. Use a professional tone.',
  });

  writeText('alex-chen/profile-text.txt', `Alex Chen
Email: alex.chen@example.com | +852 9123 4567 | Hong Kong
Customer Service Specialist at Global E-Trade Co. (2021–Present)
Skills: Customer service, English, Cantonese, E-commerce, CRM`);

  writeText('alex-chen/jd-text.txt', `Job Title: Cross-border Customer Service Specialist
Requirements: English, Cantonese, CRM, cross-border e-commerce experience`);

  writeJson('aixi/target-config.json', {
    industry: 'Technology',
    employer_type: 'private',
    experience_level: 'Entry Level (0-2 years)',
  });

  writeText('aixi/target-jd.txt', `Job Title: AI Application Development Engineer（民企 AI 应用开发工程师）
Company Type: Private Technology Enterprise（民营科技企业）

Responsibilities:
- Design and develop AI-powered business applications using LLM APIs and agent workflows
- Integrate AI capabilities into internal products (RAG, prompt engineering, tool calling)
- Collaborate with product and engineering teams to translate business needs into AI features
- Monitor application performance, reliability, and cost of AI services

Requirements:
- Bachelor's degree or above (Economics, Finance, Data Science, CS or related)
- Proficiency in Python or JavaScript; experience with REST APIs
- Strong interest or hands-on experience in LLM/AI application development
- Data analysis background and ability to connect business problems with AI solutions
- Good communication in Chinese and English`);

  writeJson('aixi/resume-manifest.json', {
    generateResumeMessage:
      'Please generate a customized resume for the target AI Application Development role at a private technology enterprise. Highlight transferable skills from finance/data background relevant to AI application development. Keep all content within one A4 page.',
    optimizeMessage:
      'Optimize my resume for the private enterprise AI Application Development Engineer role. Shorten wording and spacing so the entire resume fits on one A4 page without losing key achievements.',
    profilePhoto: {
      label: '证件照(小也)',
      path: 'profile-photo.jpg',
      source: 'D:\\简历\\照片_小.jpg',
    },
    resumeFiles: [
      {
        label: 'DOCX-金融合规(中文)',
        path: 'D:\\简历\\金融&数分商分\\陈艾希-香港大学-金融合规.docx',
        expected_lang: 'zh',
      },
      {
        label: 'PDF-Financial_Analyst(英文)',
        path: 'D:\\简历\\金融&数分商分\\Chen_Aixi__Financial_Analyst.pdf',
        expected_lang: 'en',
      },
      {
        label: 'PDF-经济学数据(中文)',
        path: 'D:\\简历\\陈艾希_中山大学_经济学_25届_数据.pdf',
        expected_lang: 'zh',
      },
    ],
  });

  const initSql = fs.readFileSync(path.join(ROOT, 'server', 'sql', 'init.sql'), 'utf8');
  const seedMatch = initSql.match(/-- 演示用企业自建岗位[\s\S]*?WHERE NOT EXISTS[\s\S]*?;/);
  if (seedMatch) {
    writeText('seed/demo-jobs.sql', seedMatch[0]);
  }

  extractFromMockApi();
  await extractFromApiClient();

  console.log('\nDone. Run: node test-data/sync-browser-bundle.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
