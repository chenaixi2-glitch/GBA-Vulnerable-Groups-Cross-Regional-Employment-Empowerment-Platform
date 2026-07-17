/**
 * Convert candidate profile / draft to editable plain text (resume optimization page style).
 */
(function (global) {
    const TYPE_LABELS = {
        education: 'Education',
        skill: 'Skill',
        work: 'Work Experience',
        internship: 'Internship',
        project: 'Project',
        award: 'Award',
        paper: 'Paper',
        custom: 'Other',
    };

    const TYPE_LABELS_ZH = {
        education: '教育',
        skill: '技能',
        work: '工作',
        internship: '实习',
        project: '项目',
        award: '奖项',
        paper: '论文',
        custom: '其他',
    };

    function useChineseLabels() {
        if (global.GBAI18n && global.GBAI18n.getLang) {
            const lang = global.GBAI18n.getLang();
            return lang === 'zh-CN' || lang === 'zh-TW' || lang === 'zh';
        }
        return false;
    }

    function typeLabel(type) {
        const map = useChineseLabels() ? TYPE_LABELS_ZH : TYPE_LABELS;
        return map[type] || map.custom;
    }

    function inferFactTitle(content, type) {
        const text = (content || '').trim();
        if (!text) return type || 'Item';
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                return parsed.title || parsed.name || parsed.company || parsed.skill
                    || parsed.school || type || 'Item';
            }
        } catch (_) { /* plain text */ }
        return text.split('\n')[0].slice(0, 120);
    }

    function candidateProfileToDisplayText(profile) {
        if (!profile) return '';
        const lines = [];
        const basic = profile.profile_basic || {};
        const zh = useChineseLabels();

        if (basic.name) lines.push((zh ? '姓名: ' : 'Name: ') + basic.name);
        if (basic.email) lines.push((zh ? '邮箱: ' : 'Email: ') + basic.email);
        if (basic.phone) lines.push((zh ? '电话: ' : 'Phone: ') + basic.phone);
        if (basic.city) lines.push((zh ? '城市: ' : 'City: ') + basic.city);
        const facts = profile.facts || [];
        const hasEducationFact = facts.some((fact) => fact.type === 'education');
        // Avoid duplicating education: school + education facts often describe the same degree.
        if (basic.school && !hasEducationFact) {
            lines.push((zh ? '学校: ' : 'School: ') + basic.school);
        }

        facts.forEach((fact) => {
            const title = inferFactTitle(fact.content, fact.type);
            const body = (fact.content || '').trim();
            lines.push('');
            lines.push(`[${typeLabel(fact.type)}] ${title}`);
            if (body && body !== title) {
                lines.push(body);
            }
        });

        return lines.join('\n').trim();
    }

    function draftToDisplayText(draft) {
        if (!draft) return '';
        const profileLike = {
            profile_basic: { ...(draft.profile_basic || {}) },
            facts: [],
        };
        const basic = profileLike.profile_basic;
        const educationEntries = draft.education || [];
        // school is only a fallback when draft.education is empty — both would duplicate.
        if (basic.school && !educationEntries.length) {
            profileLike.facts.push({
                type: 'education',
                content: JSON.stringify({
                    school: basic.school,
                    major: '',
                    degree: '',
                }),
            });
        }
        delete basic.school;
        educationEntries.forEach((edu) => {
            profileLike.facts.push({
                type: 'education',
                content: JSON.stringify({
                    school: edu.school || '',
                    major: edu.major || '',
                    degree: edu.degree || '',
                    start_date: edu.start_date || '',
                    end_date: edu.end_date || '',
                }),
            });
        });
        (draft.modules || []).forEach((mod) => {
            profileLike.facts.push({
                type: mod.type || 'custom',
                content: mod.content || mod.title || '',
            });
        });
        return candidateProfileToDisplayText(profileLike);
    }

    function displayTextFromRestoreResult(result) {
        if (!result) return '';
        if (result.draft) {
            const fromDraft = draftToDisplayText(result.draft);
            if (fromDraft) return fromDraft;
        }
        if (result.candidate_profile) {
            return candidateProfileToDisplayText(result.candidate_profile);
        }
        return '';
    }

    global.ProfileTextUtils = {
        candidateProfileToDisplayText,
        draftToDisplayText,
        displayTextFromRestoreResult,
    };
})(typeof window !== 'undefined' ? window : globalThis);
