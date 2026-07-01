'use strict';

/**
 * Build test-data/browser-bundle.js for static HTML pages (no bundler).
 * Usage: node test-data/sync-browser-bundle.js
 */

const fs = require('fs');
const path = require('path');

const TD = __dirname;

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(TD, ...parts), 'utf8'));
}

function readText(...parts) {
  return fs.readFileSync(path.join(TD, ...parts), 'utf8');
}

const bundle = {
  alexChen: {
    profileText: readText('alex-chen', 'profile-text.txt').trim(),
    jdText: readText('alex-chen', 'jd-text.txt').trim(),
    resumeEnHtml: readText('alex-chen', 'resume-en.html'),
    resumeZhHtml: readText('alex-chen', 'resume-zh.html'),
    mock: readJson('alex-chen', 'mock.json'),
  },
  mock: {
    jobs: readJson('mock', 'jobs.json'),
    interviewQuestions: readJson('mock', 'interview-questions.json'),
    policyQa: readJson('mock', 'policy-qa.json'),
    learningPathAliases: readJson('mock', 'learning-path-aliases.json'),
    learningPaths: readJson('mock', 'learning-paths.json'),
  },
};

const out = `/* eslint-disable */
/** Auto-generated — run: node test-data/sync-browser-bundle.js */
(function (global) {
  global.GBA_TEST_DATA = ${JSON.stringify(bundle, null, 2)};
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(path.join(TD, 'browser-bundle.js'), out, 'utf8');
console.log('Wrote test-data/browser-bundle.js');
