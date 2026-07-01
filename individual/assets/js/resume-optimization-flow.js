/**
 * 简历优化流程：JD 确认对话框 + 缺口追问交互对话框
 */

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
            ? (payload.clarification_hint || '请确认或编辑下方岗位描述后再继续')
            : '';

        if (noteEl) {
            noteEl.textContent = note || '系统已根据您的简历生成以下岗位描述，请确认技术方向与职责是否符合您的目标。';
            noteEl.classList.toggle('hidden', false);
        }
        if (stackEl) {
            stackEl.innerHTML = stack.length
                ? `<span class="font-medium">推断主技术栈：</span>${stack.map((s) => `<span class="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs mr-1">${escapeHtml(s)}</span>`).join('')}`
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
        Utils.showToast('请填写或确认岗位描述后再继续');
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
        Utils.showToast('请先输入目标岗位名称');
        return;
    }
    try {
        Utils.showLoading('正在根据您的简历重新生成岗位描述...');
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
            stackEl.innerHTML = `<span class="font-medium">推断主技术栈：</span>${result.primary_tech_stack.map((s) => `<span class="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs mr-1">${escapeHtml(s)}</span>`).join('')}`;
            stackEl.classList.remove('hidden');
        }
        if (hintEl && result.clarification_hint) {
            hintEl.textContent = result.clarification_hint;
            hintEl.classList.remove('hidden');
        }
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('重新生成失败: ' + error.message);
    }
}

function showOptimizationDialog({ gaps = [], questions = [], alignmentHint = '' } = {}) {
    return new Promise((resolve) => {
        _optimizationResolver = resolve;
        const modal = document.getElementById('resume-optimization-dialog');
        const gapsEl = document.getElementById('optimization-gaps-summary');
        const questionsEl = document.getElementById('optimization-questions');
        const hintEl = document.getElementById('optimization-hint');

        if (!modal || !questionsEl) {
            resolve({ proceed: true, answers: [] });
            return;
        }

        const highGaps = (gaps || []).filter((g) => (g.severity || '').toLowerCase() === 'high');
        if (gapsEl) {
            if (highGaps.length) {
                gapsEl.innerHTML = highGaps.map((g) =>
                    `<div class="p-2 bg-red-50 border border-red-100 rounded text-sm text-red-900 mb-2">${escapeHtml(g.description || g.skill || '')}</div>`
                ).join('');
                gapsEl.classList.remove('hidden');
            } else {
                gapsEl.innerHTML = '<p class="text-sm text-gray-600">未发现高风险缺口，您仍可补充以下信息以获得更精准的简历优化。</p>';
                gapsEl.classList.remove('hidden');
            }
        }

        if (hintEl) {
            hintEl.textContent = alignmentHint || '';
            hintEl.classList.toggle('hidden', !alignmentHint);
        }

        const qs = (questions || []).length ? questions : [];
        if (!qs.length) {
            questionsEl.innerHTML = '<p class="text-sm text-gray-500">暂无额外追问，可直接生成简历。</p>';
        } else {
            questionsEl.innerHTML = qs.map((q, i) => {
                const required = (q.priority || '').toLowerCase() === 'high';
                return `
                <div class="optimization-question mb-4" data-qid="${escapeHtml(q.id || `q_${i}`)}">
                    <label class="block text-sm font-medium text-gray-800 mb-1">
                        ${escapeHtml(q.question || '')}
                        ${required ? '<span class="text-red-500 ml-1">*</span>' : ''}
                    </label>
                    ${q.reason ? `<p class="text-xs text-gray-500 mb-1">${escapeHtml(q.reason)}</p>` : ''}
                    <textarea rows="2" class="optimization-answer w-full border border-gray-300 rounded-lg p-2 text-sm"
                        data-required="${required ? '1' : '0'}"
                        placeholder="请填写您的回答..."></textarea>
                </div>`;
            }).join('');
        }

        modal.classList.remove('hidden');
    });
}

function hideOptimizationDialog() {
    document.getElementById('resume-optimization-dialog')?.classList.add('hidden');
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
    if (missingRequired) {
        Utils.showToast('请先回答标有 * 的必填问题');
        return;
    }
    hideOptimizationDialog();
    if (_optimizationResolver) {
        _optimizationResolver({ proceed: true, answers });
        _optimizationResolver = null;
    }
}

function cancelOptimizationDialog() {
    hideOptimizationDialog();
    if (_optimizationResolver) {
        _optimizationResolver({ proceed: false, answers: [] });
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
        Utils.showLoading('Analyzing your resume and generating targeted job description...');
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
