'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function readText(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8').trim();
}

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));
}

module.exports = {
  ROOT,
  readText,
  readJson,
  alexChen: {
    profileText: () => readText('alex-chen', 'profile-text.txt'),
    jdText: () => readText('alex-chen', 'jd-text.txt'),
    resumeEnHtml: () => readText('alex-chen', 'resume-en.html'),
    resumeZhHtml: () => readText('alex-chen', 'resume-zh.html'),
    mock: () => readJson('alex-chen', 'mock.json'),
  },
  seniorFullstack: {
    profile: () => readText('senior-fullstack', 'profile.txt'),
    jd: () => readText('senior-fullstack', 'jd.txt'),
    messages: () => readJson('senior-fullstack', 'messages.json'),
  },
  golden: {
    answerEvaluation: () => readJson('golden', 'answer_evaluation_golden.json'),
  },
  mock: {
    jobs: () => readJson('mock', 'jobs.json'),
    interviewQuestions: () => readJson('mock', 'interview-questions.json'),
    policyQa: () => readJson('mock', 'policy-qa.json'),
    learningPathAliases: () => readJson('mock', 'learning-path-aliases.json'),
    learningPaths: () => readJson('mock', 'learning-paths.json'),
  },
  aixi: {
    targetConfig: () => readJson('aixi', 'target-config.json'),
    targetJd: () => readText('aixi', 'target-jd.txt'),
    resumeManifest: () => readJson('aixi', 'resume-manifest.json'),
    profilePhotoPath: () => path.join(ROOT, 'aixi', 'profile-photo.jpg'),
  },
};
