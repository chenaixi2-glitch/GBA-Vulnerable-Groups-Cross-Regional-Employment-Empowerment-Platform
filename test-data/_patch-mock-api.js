'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'mock-api.js');
let src = fs.readFileSync(file, 'utf8');

function replaceBlock(src, marker, replacement) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('marker not found: ' + marker);
  let i = start + marker.length;
  while (src[i] === ' ' || src[i] === '\n') i++;
  const open = src[i];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let q = '';
  let esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === q) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(0, start) + marker + replacement + src.slice(i);
}

src = replaceBlock(src, 'const mockJobs = ', 'platformMockData().jobs');
src = replaceBlock(src, 'const mockQuestions = ', 'platformMockData().interviewQuestions');
src = replaceBlock(src, 'const policySynonyms = ', 'platformMockData().policyQa');
src = replaceBlock(src, 'const learningPathJobAliases = ', 'platformMockData().learningPathAliases');
src = replaceBlock(src, 'const learningPaths = ', 'platformMockData().learningPaths');
fs.writeFileSync(file, src);
console.log('mock-api.js patched');
