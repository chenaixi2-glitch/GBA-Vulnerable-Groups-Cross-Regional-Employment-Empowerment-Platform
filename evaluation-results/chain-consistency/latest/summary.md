# Cross-Agent Chain Consistency — Evaluation Report

- Generated at: 2026-07-13T14:23:06.483206+00:00
- Cases: 5
- Pass rate: 40.00% (2/5)

## Per-case results

### gap_content_render_happy — PASS (gap_content_render)
- ✓ **gaps_preserved**: gap_count=1
- ✓ **profile_to_content**: name/email/phone aligned
- ✓ **job_to_content**: target_role aligns with job title
- ✓ **gap_to_content**: high-severity skill gaps reflected
- ✓ **content_to_render**: html length=102

### profile_mismatch_fail — FAIL (profile_content_render)
- ✗ **profile_to_content**: name: 'alex chen' != 'wrong name'; email: 'alex@example.com' != 'wrong@example.com'
- ✓ **job_to_content**: skipped (incomplete chain)
- ✗ **content_to_render**: render_agent ran but HTML empty/too short

### render_empty_fail — FAIL (content_render)
- ✗ **content_to_render**: render_agent ran but HTML empty/too short

### gap_unaddressed_fail — FAIL (gap_content_render)
- ✓ **gaps_preserved**: gap_count=1
- ✓ **profile_to_content**: skipped (incomplete chain)
- ✓ **job_to_content**: skipped (incomplete chain)
- ✗ **gap_to_content**: unaddressed gaps: ['Missing Kubernetes container orchestration experience']
- ✗ **content_to_render**: render_agent ran but HTML empty/too short

### job_title_aligned_pass — PASS (profile_content_render)
- ✓ **profile_to_content**: name/email/phone aligned
- ✓ **job_to_content**: target_role aligns with job title
- ✓ **content_to_render**: html length=133

## Check definitions

- **profile_to_content** — name/email/phone from CandidateProfile match ResumeContent.profile.
- **job_to_content** — Job.title aligns with ResumeContent.meta.target_role.
- **gap_to_content** — high-severity missing_skill gaps appear in resume text.
- **content_to_render** — render_agent success implies non-empty HTML (>100 chars).
- **gaps_preserved** — gap list not silently cleared after gap_agent.
