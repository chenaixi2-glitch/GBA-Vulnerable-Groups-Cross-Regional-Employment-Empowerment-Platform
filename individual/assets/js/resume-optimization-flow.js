/**
 * 简历优化流程：JD 确认对话框 + 缺口追问交互对话框
 */

function uiT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    let s = fallback;
    if (vars && s) {
        Object.keys(vars).forEach((k) => {
            s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return s;
}

let _jdConfirmResolver = null;
let _optimizationResolver = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showJdConfirmationModal(payload) {
    return new Promise((resolve) => {
        _jdConfirmResolver = resolve;
        const modal = document.getElementById('jd-confirmation-modal');
        const textarea = document.getElementById('jd-confirmation-text');
        const noteEl = document.getElementById('jd-confirmation-note');
        const stackEl = document.getElementById('jd-confirmation-stack');
        const hintEl = document.getElementById('jd-confirmation-hint');

        if (!modal || !textarea) {
            resolve(false);
            return;
        }

        textarea.value = payload.jd_text || '';
        const note = payload.alignment_note || '';
        const stack = (payload.primary_tech_stack || []).filter(Boolean);
        const hint = payload.clarification_hint || payload.needs_clarification
            ? (payload.clarification_hint || uiT('resume.opt.confirmJdHint', 'Please confirm or edit the job description below before continuing'))
            : '';

        if (noteEl) {
            noteEl.textContent = note || uiT('resume.opt.defaultNote', 'The system generated the job description below from your resume. Please confirm the technical direction and responsibilities match your target role.');
            noteEl.classList.toggle('hidden', false);
        }
        if (stackEl) {
            stackEl.innerHTML = stack.length
                ? `<span class="font-medium">${uiT('resume.opt.inferredStack', 'Inferred primary tech stack:')}</span>${stack.map((s) => `<span class="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs mr-1">${escapeHtml(s)}</span>`).join('')}`
                : '';
            stackEl.classList.toggle('hidden', !stack.length);
        }
        if (hintEl) {
            hintEl.textContent = hint;
            hintEl.classList.toggle('hidden', !hint);
            hintEl.className = hint
                ? 'mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800'
                : 'hidden';
        }

        modal.classList.remove('hidden');
    });
}

function hideJdConfirmationModal() {
    document.getElementById('jd-confirmation-modal')?.classList.add('hidden');
}

function confirmJdModal() {
    const textarea = document.getElementById('jd-confirmation-text');
    const jdText = textarea?.value.trim() || '';
    if (!jdText) {
        Utils.showToast(uiT('resume.opt.confirmJdRequired', 'Please fill in or confirm the job description before continuing'));
        return;
    }
    const mainTextarea = document.getElementById('jd-text');
    if (mainTextarea) mainTextarea.value = jdText;
    hideJdConfirmationModal();
    if (_jdConfirmResolver) {
        _jdConfirmResolver({ confirmed: true, jd_text: jdText });
        _jdConfirmResolver = null;
    }
}

function cancelJdModal() {
    hideJdConfirmationModal();
    if (_jdConfirmResolver) {
        _jdConfirmResolver({ confirmed: false });
        _jdConfirmResolver = null;
    }
}

async function regenerateJdInModal() {
    const jobTitle = document.getElementById('jd-text')?.value.trim()
        || document.getElementById('jd-confirmation-text')?.value.trim().split('\n')[0]
        || '';
    if (!jobTitle) {
        Utils.showToast(uiT('resume.opt.jobTitleRequired', 'Please enter a target job title first'));
        return;
    }
    try {
        Utils.showLoading(uiT('resume.opt.regeneratingJd', 'Regenerating job description from your resume...'));
        const ctx = typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : {};
        const result = await apiClient.generateJdFromTitle(jobTitle, ctx);
        Utils.hideLoading();

        const textarea = document.getElementById('jd-confirmation-text');
        const noteEl = document.getElementById('jd-confirmation-note');
        const stackEl = document.getElementById('jd-confirmation-stack');
        const hintEl = document.getElementById('jd-confirmation-hint');
        if (textarea) textarea.value = result.jd_text || '';
        if (noteEl) noteEl.textContent = result.alignment_note || noteEl.textContent;
        if (stackEl && result.primary_tech_stack?.length) {
            stackEl.innerHTML = `<span class="font-medium">${uiT('resume.opt.inferredStack', 'Inferred primary tech stack:')}</span>${result.primary_tech_stack.map((s) => `<span class="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs mr-1">${escapeHtml(s)}</span>`).join('')}`;
            stackEl.classList.remove('hidden');
        }
        if (hintEl && result.clarification_hint) {
            hintEl.textContent = result.clarification_hint;
            hintEl.classList.remove('hidden');
        }
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('resume.opt.regenerateFailed', 'Regeneration failed: {msg}', { msg: error.message }));
    }
}

function mergeSupplementQuestions(questions, gaps) {
    const qs = [...(questions || [])];
    const coveredTypes = new Set(
        qs.filter((q) => q.target_field).map((q) => String(q.target_field).toLowerCase())
    );
    (gaps || []).forEach((gap, index) => {
        const type = String(gap.type || '').toLowerCase();
        if (type !== 'missing_experience') return;
        const field = gap.target_field || gap.related_section_ids?.[0] || 'internships';
        if (coveredTypes.has(String(field).toLowerCase())) return;
        coveredTypes.add(String(field).toLowerCase());
        qs.push({
            id: gap.id || `gap_supplement_${index}`,
            question: uiT(
                'resume.opt.supplementExperiencePrompt',
                'Please describe the relevant experience you can add (company/project, role, responsibilities, outcomes):'
            ),
            reason: gap.description || uiT(
                'resume.opt.supplementExperienceReason',
                'This experience is needed to better match the target role'
            ),
            target_field: field,
            priority: (gap.severity || '').toLowerCase() === 'high' ? 'high' : 'medium',
        });
    });
    return qs;
}

function showOptimizationDialog({ gaps = [], questions = [], removals = [], alignmentHint = '' } = {}) {
    const qs = mergeSupplementQuestions(questions, gaps).filter(Boolean);
    const removalItems = (removals || []).filter((r) => r && (r.title || r.reason));
    const quantGaps = (gaps || []).filter((g) => (g.type || '').toLowerCase() === 'no_quantification');
    const hasQuantFollowUp = quantGaps.length > 0 || qs.some((q) => /量化|quantif|números|numbers|metrics/i.test(`${q.question || ''} ${q.reason || ''}`));
    if (!qs.length && !alignmentHint && !hasQuantFollowUp && !removalItems.length) {
        return Promise.resolve({ proceed: true, answers: [], removals: [] });
    }

    return new Promise((resolve) => {
        _optimizationResolver = resolve;
        const modal = document.getElementById('resume-optimization-dialog');
        const gapsEl = document.getElementById('optimization-gaps-summary');
        const removalsEl = document.getElementById('optimization-removals');
        const questionsEl = document.getElementById('optimization-questions');
        const hintEl = document.getElementById('optimization-hint');

        if (!modal || !questionsEl) {
            resolve({ proceed: true, answers: [], removals: [] });
            return;
        }

        const highGaps = (gaps || []).filter((g) => (g.severity || '').toLowerCase() === 'high');
        const mediumQuantGaps = quantGaps.filter((g) => (g.severity || '').toLowerCase() !== 'high');
        if (gapsEl) {
            const gapBlocks = [];
            if (highGaps.length) {
                gapBlocks.push(...highGaps.map((g) =>
                    `<div class="p-2 bg-red-50 border border-red-100 rounded text-sm text-red-900 mb-2">${escapeHtml(g.description || g.skill || '')}</div>`
                ));
            }
            if (mediumQuantGaps.length) {
                gapBlocks.push(...mediumQuantGaps.map((g) =>
                    `<div class="p-2 bg-amber-50 border border-amber-100 rounded text-sm text-amber-900 mb-2">${escapeHtml(g.description || g.skill || '')}</div>`
                ));
            }
            if (gapBlocks.length) {
                gapsEl.innerHTML = gapBlocks.join('');
                gapsEl.classList.remove('hidden');
            } else {
                gapsEl.innerHTML = '<p class="text-sm text-gray-600">' + uiT('resume.opt.noHighGaps', 'No high-risk gaps found. You can still add details below for more precise resume optimization.') + '</p>';
                gapsEl.classList.toggle('hidden', !qs.length && !removalItems.length);
            }
        }

        if (removalsEl) {
            if (removalItems.length) {
                removalsEl.innerHTML = `
                    <h4 class="text-sm font-semibold text-gray-900 mb-2">${uiT('resume.opt.removalsTitle', 'Suggested experience removals')}</h4>
                    <p class="text-xs text-gray-500 mb-3">${uiT('resume.opt.removalsDesc', 'The system suggests omitting the entries below to fit one A4 page or improve role relevance. Each item includes a reason — check only those you agree to remove.')}</p>
                    ${removalItems.map((item, i) => `
                    <div class="optimization-removal mb-3 p-3 border border-orange-200 bg-orange-50 rounded-lg"
                        data-removal-id="${escapeHtml(item.id || `rem_${i}`)}"
                        data-fact-id="${escapeHtml(item.fact_id || '')}"
                        data-title="${escapeHtml(item.title || '')}"
                        data-reason="${escapeHtml(item.reason || '')}">
                        <div class="flex items-start gap-2">
                            <input type="checkbox" class="removal-agree mt-1 rounded border-orange-400 text-orange-600 focus:ring-orange-500" id="removal-${i}">
                            <div class="flex-1 min-w-0">
                                <label for="removal-${i}" class="block text-sm font-medium text-gray-900 cursor-pointer">
                                    ${escapeHtml(item.title || uiT('resume.opt.unnamedExperience', 'Unnamed experience'))}
                                </label>
                                ${item.section_type ? `<p class="text-xs text-gray-500 mt-0.5">${uiT('resume.opt.sectionType', 'Section')}: ${escapeHtml(item.section_type)}</p>` : ''}
                                <p class="text-xs text-orange-900 mt-1"><span class="font-medium">${uiT('resume.opt.removalReasonLabel', 'Reason')}:</span> ${escapeHtml(item.reason || '')}</p>
                            </div>
                        </div>
                    </div>`).join('')}
                `;
                removalsEl.classList.remove('hidden');
            } else {
                removalsEl.innerHTML = '';
                removalsEl.classList.add('hidden');
            }
        }

        if (hintEl) {
            const quantHint = hasQuantFollowUp
                ? uiT('resume.opt.quantHint', 'Some experiences lack quantified results. If you have real metrics (users served, performance gains, team size, etc.), please share them below. Leave blank if none — we will not invent numbers.')
                : '';
            const combinedHint = [alignmentHint, quantHint].filter(Boolean).join('\n\n');
            hintEl.textContent = combinedHint;
            hintEl.classList.toggle('hidden', !combinedHint);
            if (combinedHint) {
                hintEl.className = 'mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 whitespace-pre-line';
            }
        }

        if (!qs.length) {
            questionsEl.innerHTML = removalItems.length
                ? '<p class="text-sm text-gray-500">' + uiT('resume.opt.noExtraQuestions', 'No extra questions — you can generate the resume directly.') + '</p>'
                : '<p class="text-sm text-gray-500">' + uiT('resume.opt.noExtraQuestions', 'No extra questions — you can generate the resume directly.') + '</p>';
        } else {
            questionsEl.innerHTML = `
                <h4 class="text-sm font-semibold text-gray-900 mb-2">${uiT('resume.opt.supplementTitle', 'Supplement your experience')}</h4>
                ${qs.map((q, i) => {
                const required = (q.priority || '').toLowerCase() === 'high';
                const isQuant = /量化|quantif|números|numbers|metrics/i.test(`${q.question || ''} ${q.reason || ''}`);
                const placeholder = isQuant
                    ? uiT('resume.opt.quantAnswerPlaceholder', 'Enter real numbers if you have them (e.g. 10k users, 30% faster); leave blank if none')
                    : uiT('resume.opt.answerPlaceholder', 'Enter your answer...');
                return `
                <div class="optimization-question mb-4" data-qid="${escapeHtml(q.id || `q_${i}`)}">
                    <label class="block text-sm font-medium text-gray-800 mb-1">
                        ${escapeHtml(q.question || '')}
                        ${required ? '<span class="text-red-500 ml-1">*</span>' : ''}
                    </label>
                    ${q.reason ? `<p class="text-xs text-gray-500 mb-1">${escapeHtml(q.reason)}</p>` : ''}
                    <textarea rows="3" class="optimization-answer w-full border border-gray-300 rounded-lg p-2 text-sm"
                        data-required="${required ? '1' : '0'}"
                        placeholder="${escapeHtml(placeholder)}"></textarea>
                </div>`;
            }).join('')}`;
        }

        modal.classList.remove('hidden');
    });
}

function hideOptimizationDialog() {
    document.getElementById('resume-optimization-dialog')?.classList.add('hidden');
}

function collectRemovalDecisions() {
    const items = document.querySelectorAll('.optimization-removal');
    const removals = [];
    items.forEach((item) => {
        const agreed = item.querySelector('.removal-agree')?.checked || false;
        removals.push({
            id: item.dataset.removalId,
            fact_id: item.dataset.factId || '',
            title: item.dataset.title || '',
            reason: item.dataset.reason || '',
            agreed,
        });
    });
    return removals;
}

function collectOptimizationAnswers() {
    const items = document.querySelectorAll('.optimization-question');
    const answers = [];
    let missingRequired = false;

    items.forEach((item) => {
        const textarea = item.querySelector('.optimization-answer');
        const question = item.querySelector('label')?.textContent?.replace(/\*/g, '').trim() || '';
        const answer = textarea?.value.trim() || '';
        const required = textarea?.dataset.required === '1';
        if (required && !answer) missingRequired = true;
        answers.push({ id: item.dataset.qid, question, answer, required });
    });

    return { answers, missingRequired };
}

function submitOptimizationDialog() {
    const { answers, missingRequired } = collectOptimizationAnswers();
    const removals = collectRemovalDecisions();
    if (missingRequired) {
        Utils.showToast(uiT('resume.opt.requiredQuestions', 'Please answer all required questions marked with *'));
        return;
    }
    hideOptimizationDialog();
    if (_optimizationResolver) {
        _optimizationResolver({ proceed: true, answers, removals });
        _optimizationResolver = null;
    }
}

function cancelOptimizationDialog() {
    hideOptimizationDialog();
    if (_optimizationResolver) {
        _optimizationResolver({ proceed: false, answers: [], removals: [] });
        _optimizationResolver = null;
    }
}

/**
 * 确保 JD 已经用户确认；若仅为岗位名则先结合简历生成
 */
async function ensureJdConfirmedBeforeProceed(jdText, options = {}) {
    const { jdAutoGenerated = false, jdUserConfirmed = false } = options;
    if (!needsJdUserConfirmation(jdText, { jdAutoGenerated, jdUserConfirmed })) {
        return { confirmed: true, jd_text: jdText };
    }

    let payload = { jd_text: jdText, alignment_note: '', primary_tech_stack: [], clarification_hint: '' };

    if (isTitleOnlyJd(jdText)) {
        Utils.showLoading(uiT('resume.opt.analyzingForJd', 'Analyzing your resume and generating a targeted job description...'));
        try {
            const ctx = typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : {};
            payload = await apiClient.generateJdFromTitle(jdText, ctx);
        } finally {
            Utils.hideLoading();
        }
    }

    const result = await showJdConfirmationModal(payload);
    return { ...result, alignment_note: payload.alignment_note, clarification_hint: payload.clarification_hint };
}
