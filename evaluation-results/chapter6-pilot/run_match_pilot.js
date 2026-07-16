/**
 * Pilot: job–resume match ranking agreement vs hand labels.
 * Uses server/src/services/match.service.js (production scorer).
 *
 * Hand labels: expected_band = high | mid | low; expected_rank_order = descending preference.
 * Run: node evaluation-results/chapter6-pilot/run_match_pilot.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const match = require('../../server/src/services/match.service');

const cases = [
  {
    id: 'cs_high',
    expected_band: 'high',
    job: {
      title: 'Customer Service Representative (Remote)',
      description: 'Handle customer inquiries via chat and email. Excel reporting. Cross-border ecommerce support.',
      skills: JSON.stringify(['customer service', 'excel', 'email', 'cantonese', 'ecommerce']),
      education: 'diploma',
      work_experience: '1 year',
    },
    resume: {
      skills_text: 'customer service, excel, email support, cantonese, ecommerce',
      content_json: {
        summary: 'Remote customer service for ecommerce brands',
        facts: [
          { type: 'skill', content: 'Excel' },
          { type: 'skill', content: 'Customer service' },
          { type: 'education', content: JSON.stringify({ degree: 'diploma', major: 'Business' }) },
          {
            type: 'work',
            content: JSON.stringify({
              title: 'CS Agent',
              achievements: 'Handled chat tickets, excel weekly reports for ecommerce clients',
            }),
          },
        ],
      },
    },
  },
  {
    id: 'ops_mid',
    expected_band: 'mid',
    job: {
      title: 'Fund Operations Associate',
      description: 'Cash reconciliation, settlement processing, NAV support, Excel macros.',
      skills: JSON.stringify(['reconciliation', 'settlement', 'excel', 'fund operations']),
      education: 'bachelor',
      work_experience: '1-3 years',
    },
    resume: {
      skills_text: 'excel, accounting, data entry',
      content_json: {
        summary: 'Internship in accounting operations',
        facts: [
          { type: 'skill', content: 'Excel' },
          { type: 'education', content: JSON.stringify({ degree: 'bachelor', major: 'Finance' }) },
          {
            type: 'internship',
            content: JSON.stringify({
              title: 'Accounting Intern',
              achievements: 'Monthly reporting and invoice checks',
            }),
          },
        ],
      },
    },
  },
  {
    id: 'dev_low',
    expected_band: 'low',
    job: {
      title: 'Backend Software Engineer',
      description: 'Build Java microservices, Kubernetes, Spring Boot APIs.',
      skills: JSON.stringify(['java', 'kubernetes', 'spring boot', 'microservices']),
      education: 'bachelor',
      work_experience: '3 years',
    },
    resume: {
      skills_text: 'customer service, excel, cantonese',
      content_json: {
        summary: 'Customer support specialist',
        facts: [
          { type: 'skill', content: 'Customer service' },
          { type: 'education', content: JSON.stringify({ degree: 'diploma', major: 'Business' }) },
          {
            type: 'work',
            content: JSON.stringify({ title: 'CS Agent', achievements: 'Phone support' }),
          },
        ],
      },
    },
  },
  {
    id: 'data_high',
    expected_band: 'high',
    job: {
      title: 'Data Annotation Specialist',
      description: 'Label text and image datasets. Attention to detail. Basic Python optional.',
      skills: JSON.stringify(['data annotation', 'attention to detail', 'excel', 'python']),
      education: 'no requirement',
      work_experience: 'less than 1 year',
    },
    resume: {
      skills_text: 'data annotation, excel, attention to detail, python basics',
      content_json: {
        summary: 'Part-time data labeling for NLP datasets',
        facts: [
          { type: 'skill', content: 'Data annotation' },
          { type: 'skill', content: 'Python' },
          {
            type: 'project',
            content: JSON.stringify({
              title: 'Annotation project',
              achievements: 'Labeled 5k samples with excel QA sheet',
            }),
          },
        ],
      },
    },
  },
  {
    id: 'retail_mid',
    expected_band: 'mid',
    job: {
      title: 'E-commerce Operations Assistant',
      description: 'Listing updates, inventory tracking, customer chat backup.',
      skills: JSON.stringify(['ecommerce', 'inventory', 'excel', 'customer']),
      education: 'diploma',
      work_experience: '1 year',
    },
    resume: {
      skills_text: 'excel, retail sales, inventory',
      content_json: {
        summary: 'Retail associate with inventory duties',
        facts: [
          { type: 'skill', content: 'Excel' },
          { type: 'education', content: JSON.stringify({ degree: 'diploma', major: 'Retail' }) },
          {
            type: 'work',
            content: JSON.stringify({
              title: 'Store Associate',
              achievements: 'Inventory counts and customer service',
            }),
          },
        ],
      },
    },
  },
  {
    id: 'nurse_low',
    expected_band: 'low',
    job: {
      title: 'Registered Nurse',
      description: 'Clinical care, patient monitoring, medical licensing required.',
      skills: JSON.stringify(['nursing', 'patient care', 'clinical', 'license']),
      education: 'bachelor',
      work_experience: '3 years',
    },
    resume: {
      skills_text: 'excel, customer service, data annotation',
      content_json: {
        summary: 'Office and ecommerce support',
        facts: [
          { type: 'skill', content: 'Excel' },
          { type: 'education', content: JSON.stringify({ degree: 'diploma', major: 'Business' }) },
        ],
      },
    },
  },
];

function bandOf(score) {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function main() {
  const scored = cases.map((c) => {
    const r = match.scoreJobResume(c.job, c.resume);
    return {
      id: c.id,
      expected_band: c.expected_band,
      score: r.score,
      predicted_band: bandOf(r.score),
      reasons: r.reasons,
      band_agree: bandOf(r.score) === c.expected_band,
    };
  });

  const bandAgree = scored.filter((s) => s.band_agree).length;

  // Ranking: within each expected band group, scores should be ordered high>mid>low overall
  const byId = Object.fromEntries(scored.map((s) => [s.id, s.score]));
  const rankingChecks = [
    { name: 'cs_high > ops_mid', pass: byId.cs_high > byId.ops_mid },
    { name: 'cs_high > dev_low', pass: byId.cs_high > byId.dev_low },
    { name: 'data_high > retail_mid', pass: byId.data_high > byId.retail_mid },
    { name: 'data_high > nurse_low', pass: byId.data_high > byId.nurse_low },
    { name: 'ops_mid > nurse_low', pass: byId.ops_mid > byId.nurse_low },
    { name: 'retail_mid > nurse_low', pass: byId.retail_mid > byId.nurse_low },
    { name: 'ops_mid > dev_low', pass: byId.ops_mid > byId.dev_low },
    { name: 'avg_high > avg_low', pass: (byId.cs_high + byId.data_high) / 2 > (byId.dev_low + byId.nurse_low) / 2 },
  ];
  const rankPass = rankingChecks.filter((c) => c.pass).length;

  const report = {
    cases: scored.length,
    band_agreement: bandAgree,
    band_agreement_rate: Number((bandAgree / scored.length).toFixed(4)),
    ranking_checks: rankingChecks.length,
    ranking_agreement: rankPass,
    ranking_agreement_rate: Number((rankPass / rankingChecks.length).toFixed(4)),
    scored,
    rankingChecks,
    note: 'Pilot hand-labeled bands (high/mid/low) on inclusive/flexible vs mismatched roles.',
  };

  const outDir = __dirname;
  fs.writeFileSync(path.join(outDir, 'match_pilot_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    cases: report.cases,
    band_agreement_rate: report.band_agreement_rate,
    ranking_agreement_rate: report.ranking_agreement_rate,
    scores: scored.map((s) => ({ id: s.id, score: s.score, expected: s.expected_band, predicted: s.predicted_band })),
  }, null, 2));
}

main();
