const fs = require('fs');
const p = require('path').join(__dirname, '../../individual/assets/js/learning-path.js');
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('function uiT(')) {
  s = s.replace(
    'let timelineEditMode = false;\n',
    'let timelineEditMode = false;\n\nfunction uiT(key, fallback, vars) {\n    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);\n    let out = fallback;\n    if (vars && out) Object.keys(vars).forEach((k) => { out = String(out).replace(new RegExp(\'\\\\{\' + k + \'\\\\}\', \'g\'), vars[k]); });\n    return out;\n}\n'
  );
}
const reps = [
  ["Utils.showToast('Please enter your target job title')", "Utils.showToast(uiT('learningPath.toast.targetJobRequired', 'Please enter your target job title'))"],
  ["Utils.showToast('Please provide current skills, role, or profile details')", "Utils.showToast(uiT('learningPath.toast.skillsRequired', 'Please provide current skills, role, or profile details'))"],
  ["Utils.showToast('Skill gap analysis completed! Choose your daily study hours.')", "Utils.showToast(uiT('learningPath.toast.gapCompleted', 'Skill gap analysis completed! Choose your daily study hours.'))"],
  ["Utils.showToast('Failed to analyze skill gaps: ' + error.message)", "Utils.showToast(uiT('learningPath.toast.gapFailed', 'Failed to analyze skill gaps: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Please run skill gap analysis first')", "Utils.showToast(uiT('learningPath.toast.runGapFirst', 'Please run skill gap analysis first'))"],
  ["Utils.showToast('Please select a valid daily study duration')", "Utils.showToast(uiT('learningPath.toast.selectDailyHours', 'Please select a valid daily study duration'))"],
  ["Utils.showToast('Learning timeline generated!')", "Utils.showToast(uiT('learningPath.toast.timelineGenerated', 'Learning timeline generated!'))"],
  ["Utils.showToast('Failed to generate timeline: ' + error.message)", "Utils.showToast(uiT('learningPath.toast.timelineFailed', 'Failed to generate timeline: {msg}', { msg: error.message }))"],
  ["Utils.showToast('No timeline to edit')", "Utils.showToast(uiT('learningPath.toast.noTimeline', 'No timeline to edit'))"],
  ["Utils.showToast('Timeline cannot be empty')", "Utils.showToast(uiT('learningPath.toast.timelineEmpty', 'Timeline cannot be empty'))"],
  ["Utils.showToast('Each phase needs a title and week range')", "Utils.showToast(uiT('learningPath.toast.phaseNeedsTitle', 'Each phase needs a title and week range'))"],
  ["Utils.showToast('Timeline updated')", "Utils.showToast(uiT('learningPath.toast.timelineUpdated', 'Timeline updated'))"],
  ["Utils.showToast('Failed to update timeline: ' + error.message)", "Utils.showToast(uiT('learningPath.toast.updateFailed', 'Failed to update timeline: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Generate a timeline before saving')", "Utils.showToast(uiT('learningPath.toast.generateTimelineFirst', 'Generate a timeline before saving'))"],
  ["Utils.showToast('Please log in to save your learning path')", "Utils.showToast(uiT('learningPath.toast.loginToSave', 'Please log in to save your learning path'))"],
  ["hint.textContent = result.message || 'Learning path saved to your account.'", "hint.textContent = result.message || uiT('learningPath.toast.savedToAccount', 'Learning path saved to your account.')"],
  ["Utils.showToast('Learning path saved!')", "Utils.showToast(uiT('learningPath.toast.saved', 'Learning path saved!'))"],
  ["Utils.showToast('Save failed: ' + error.message)", "Utils.showToast(uiT('learningPath.toast.saveFailed', 'Save failed: {msg}', { msg: error.message }))"],
  ["Utils.showToast('No learning plan to download')", "Utils.showToast(uiT('learningPath.toast.nothingToDownload', 'No learning plan to download'))"],
  ["Utils.showToast('Learning plan exported as TXT')", "Utils.showToast(uiT('learningPath.toast.exportedTxt', 'Learning plan exported as TXT'))"],
  ["Utils.showToast('No learning plan to export')", "Utils.showToast(uiT('learningPath.toast.nothingToExport', 'No learning plan to export'))"],
  ["Utils.showToast('Learning plan exported as JSON')", "Utils.showToast(uiT('learningPath.toast.exportedJson', 'Learning plan exported as JSON'))"],
];
reps.forEach(([a, b]) => {
  if (!s.includes(a)) console.warn('missing:', a.slice(0, 50));
  s = s.split(a).join(b);
});
fs.writeFileSync(p, s);
console.log('patched learning-path.js');
