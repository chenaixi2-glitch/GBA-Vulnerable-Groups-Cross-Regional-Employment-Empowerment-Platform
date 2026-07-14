'use strict';

const { parseGroupTypesJson, parseTargetCriteria } = require('../constants/groupTypes');

function normalizeSkill(s) {
  return String(s || '').toLowerCase().trim();
}

function parseSkillsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean) : [];
    } catch {
      return raw.split(/[,，;；|]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function extractJobSkills(job) {
  const skills = parseSkillsJson(job.skills);
  const fromDesc = String(job.description || '')
    .toLowerCase()
    .match(/[a-z\u4e00-\u9fff]{2,30}/g) || [];
  const unique = new Set([
    ...skills.map(normalizeSkill),
    ...fromDesc.slice(0, 30),
  ]);
  return [...unique].filter(Boolean);
}

function extractResumeSkills(resume) {
  if (!resume) return [];
  const skills = new Set();

  if (resume.skills_text) {
    resume.skills_text.split(/[,，;；|\/\n]/).forEach((s) => {
      const n = normalizeSkill(s);
      if (n) skills.add(n);
    });
  }

  const content = resume.content_json || {};
  if (Array.isArray(content.skills)) {
    content.skills.forEach((s) => skills.add(normalizeSkill(s)));
  }

  const facts = content.facts || content.candidate_profile?.facts || [];
  facts.forEach((fact) => {
    if (fact.type === 'skill') {
      skills.add(normalizeSkill(fact.content));
    }
    if (['internship', 'project', 'work', 'education'].includes(fact.type)) {
      try {
        const obj = typeof fact.content === 'string' ? JSON.parse(fact.content) : fact.content;
        if (obj.title) skills.add(normalizeSkill(obj.title));
        if (obj.major) skills.add(normalizeSkill(obj.major));
        if (obj.achievements) {
          String(obj.achievements).split(/[,，;；\s]+/).forEach((w) => {
            if (w.length > 2) skills.add(normalizeSkill(w));
          });
        }
      } catch {
        /* ignore */
      }
    }
  });

  const summary = content.summary || content.profile_basic?.summary || '';
  String(summary).split(/[,，;；\s]+/).forEach((w) => {
    if (w.length > 2) skills.add(normalizeSkill(w));
  });

  return [...skills].filter(Boolean);
}

function skillOverlapScore(jobSkills, resumeSkills) {
  if (!jobSkills.length) return { score: 30, matched: [], reasons: ['Job posting has no specific skill requirements'] };
  if (!resumeSkills.length) return { score: 15, matched: [], reasons: ['No skill information found in resume'] };

  const matched = jobSkills.filter((js) =>
    resumeSkills.some((rs) => rs.includes(js) || js.includes(rs))
  );

  const ratio = matched.length / jobSkills.length;
  const score = Math.round(Math.min(50, ratio * 50));
  const reasons = matched.length
    ? [`Skills matched: ${matched.slice(0, 5).join(', ')}`]
    : ['Limited skill overlap with job requirements'];
  return { score, matched, reasons };
}

function educationScore(job, resume) {
  const jobEdu = normalizeSkill(job.education || '');
  if (!jobEdu || jobEdu.includes('no requirement') || jobEdu.includes('无')) {
    return { score: 10, reason: null };
  }
  const content = resume?.content_json || {};
  const facts = content.facts || [];
  const eduFacts = facts.filter((f) => f.type === 'education');
  const resumeEdu = eduFacts.map((f) => normalizeSkill(f.content)).join(' ');
  if (!resumeEdu) return { score: 5, reason: 'Education information not filled in' };

  const levels = ['phd', 'doctor', '博士', 'master', '硕士', 'bachelor', '本科', 'diploma', '专科', 'high school'];
  const jobLevel = levels.findIndex((l) => jobEdu.includes(l));
  const resumeLevel = levels.findIndex((l) => resumeEdu.includes(l));
  if (jobLevel >= 0 && resumeLevel >= 0 && resumeLevel <= jobLevel) {
    return { score: 15, reason: 'Education meets job requirements' };
  }
  if (resumeEdu && jobEdu) return { score: 8, reason: 'Education partially matches' };
  return { score: 5, reason: null };
}

function experienceScore(job, resume) {
  const jobExp = normalizeSkill(job.work_experience || '');
  if (!jobExp || jobExp.includes('no experience') || jobExp.includes('无')) {
    return { score: 10, reason: null };
  }
  const content = resume?.content_json || {};
  const facts = (content.facts || []).filter((f) =>
    ['internship', 'project', 'work'].includes(f.type)
  );
  if (!facts.length) return { score: 5, reason: 'Limited work experience listed' };
  const years = facts.length;
  if (jobExp.includes('10+') && years >= 3) return { score: 20, reason: 'Strong work experience' };
  if (jobExp.includes('5') && years >= 2) return { score: 18, reason: 'Work experience meets requirements' };
  if (jobExp.includes('3') && years >= 1) return { score: 16, reason: 'Has relevant work experience' };
  if (jobExp.includes('1') || jobExp.includes('less')) return { score: 15, reason: 'Has basic work experience' };
  return { score: 12, reason: 'Has relevant internship or project experience' };
}

function descriptionOverlapScore(job, resume) {
  const desc = normalizeSkill(`${job.title} ${job.description || ''}`);
  const resumeText = normalizeSkill(
    JSON.stringify(resume?.content_json || {}) + (resume?.skills_text || '')
  );
  if (!desc || !resumeText) return { score: 5, reasons: [] };

  const keywords = desc.split(/\s+/).filter((w) => w.length > 3).slice(0, 40);
  const hits = keywords.filter((k) => resumeText.includes(k));
  const score = Math.min(15, Math.round((hits.length / Math.max(keywords.length, 1)) * 15));
  const reasons = hits.length ? [`Matched ${hits.length} job keyword(s)`] : [];
  return { score, reasons };
}

/**
 * Score how well a job matches a user resume (0-100).
 */
function scoreJobResume(job, resume) {
  const jobSkills = extractJobSkills(job);
  const resumeSkills = extractResumeSkills(resume);

  const skillPart = skillOverlapScore(jobSkills, resumeSkills);
  const eduPart = educationScore(job, resume);
  const expPart = experienceScore(job, resume);
  const descPart = descriptionOverlapScore(job, resume);

  const reasons = [
    ...skillPart.reasons,
    eduPart.reason ? eduPart.reason : null,
    expPart.reason ? expPart.reason : null,
    ...descPart.reasons,
  ].filter(Boolean);

  const raw = skillPart.score + eduPart.score + expPart.score + descPart.score;
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  if (!resume) {
    return { score: Math.min(score, 40), reasons: ['Please complete your resume for a more accurate match score', ...reasons] };
  }

  return { score, reasons: reasons.length ? reasons : ['Overall fit with this role looks reasonable'] };
}

function mapRowSkills(row) {
  if (!row) return row;
  return {
    ...row,
    target_group_types: parseGroupTypesJson(row.target_group_types),
    target_criteria: parseTargetCriteria(row.target_criteria),
    vulnerable_group_friendly: Boolean(row.vulnerable_group_friendly),
    skills: parseSkillsJson(row.skills),
  };
}

module.exports = {
  scoreJobResume,
  extractJobSkills,
  extractResumeSkills,
  parseSkillsJson,
  mapRowSkills,
};
