const fs = require('fs');
const p = require('path').join(__dirname, '../../individual/assets/js/interview-prep.js');
let s = fs.readFileSync(p, 'utf8');
const reps = [
  ["Utils.showToast('Please upload a resume or paste profile text')", "Utils.showToast(uiT('interview.toast.uploadOrPaste', 'Please upload a resume or paste profile text'))"],
  ["Utils.showToast('Profile uploaded successfully')", "Utils.showToast(uiT('interview.toast.profileUploaded', 'Profile uploaded successfully'))"],
  ["Utils.showToast('Failed to upload profile: ' + error.message)", "Utils.showToast(uiT('interview.toast.profileFailed', 'Failed to upload profile: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Please paste the target job description or fill in target job fields')", "Utils.showToast(uiT('interview.toast.pasteJd', 'Please paste the target job description or fill in target job fields'))"],
  ["Utils.showToast('Job description submitted successfully')", "Utils.showToast(uiT('interview.toast.jdSubmitted', 'Job description submitted successfully'))"],
  ["Utils.showToast('Failed to submit job description: ' + error.message)", "Utils.showToast(uiT('interview.toast.jdFailed', 'Failed to submit job description: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Resume content ready for interview generation')", "Utils.showToast(uiT('interview.toast.resumeReady', 'Resume content ready for interview generation'))"],
  ["throw new Error('Resume content was not generated')", "throw new Error(uiT('interview.toast.resumeNotGenerated', 'Resume content was not generated'))"],
  ["Utils.showToast('Failed to generate resume: ' + error.message)", "Utils.showToast(uiT('interview.toast.resumeFailed', 'Failed to generate resume: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Please enter a job title')", "Utils.showToast(uiT('interview.toast.jobTitleRequired', 'Please enter a job title'))"],
  ["Utils.showToast('Please complete all prerequisite steps first')", "Utils.showToast(uiT('interview.toast.completePrereq', 'Please complete all prerequisite steps first'))"],
  ["throw new Error('No questions generated. Ensure profile, job description, and resume are complete.')", "throw new Error(uiT('interview.toast.noQuestionsGenerated', 'No questions generated. Ensure profile, job description, and resume are complete.'))"],
  ["Utils.showToast(`Generated ${interviewSession.questions.length} questions across ${interviewSession.stages.length} stages`)", "Utils.showToast(uiT('interview.toast.questionsGenerated', 'Generated {count} questions across {stages} stages', { count: interviewSession.questions.length, stages: interviewSession.stages.length }))"],
  ["Utils.showToast('Failed to generate questions: ' + error.message)", "Utils.showToast(uiT('interview.toast.questionsFailed', 'Failed to generate questions: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Please enter or upload at least one interview question')", "Utils.showToast(uiT('interview.toast.customQuestionsRequired', 'Please enter or upload at least one interview question'))"],
  ["throw new Error('No reference answers generated. Ensure profile, job description, and resume are complete.')", "throw new Error(uiT('interview.toast.noReferenceAnswers', 'No reference answers generated. Ensure profile, job description, and resume are complete.'))"],
  ["Utils.showToast(`Generated reference answers for ${interviewSession.questions.length} custom questions`)", "Utils.showToast(uiT('interview.toast.answersGenerated', 'Generated reference answers for {count} custom questions', { count: interviewSession.questions.length }))"],
  ["Utils.showToast('Failed to generate reference answers: ' + error.message)", "Utils.showToast(uiT('interview.toast.answersFailed', 'Failed to generate reference answers: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Interactive mock interview started')", "Utils.showToast(uiT('interview.toast.started', 'Interactive mock interview started'))"],
  ["Utils.showToast('Failed to start interactive interview: ' + error.message)", "Utils.showToast(uiT('interview.toast.startFailed', 'Failed to start interactive interview: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Please type your answer')", "Utils.showToast(uiT('interview.toast.typeAnswer', 'Please type your answer'))"],
  ["Utils.showToast('Interview is not active')", "Utils.showToast(uiT('interview.toast.notActive', 'Interview is not active'))"],
  ["Utils.showToast('Interview ended. Generating debrief...')", "Utils.showToast(uiT('interview.toast.endedDebrief', 'Interview ended. Generating debrief...'))"],
  ["Utils.showToast('Failed to submit answer: ' + error.message)", "Utils.showToast(uiT('interview.toast.submitFailed', 'Failed to submit answer: {msg}', { msg: error.message }))"],
  ["Utils.showToast('No active interview to end')", "Utils.showToast(uiT('interview.toast.noInterviewToEnd', 'No active interview to end'))"],
  ["Utils.showToast('Debrief report ready')", "Utils.showToast(uiT('interview.toast.debriefReady', 'Debrief report ready'))"],
  ["Utils.showToast('Failed to generate debrief: ' + error.message)", "Utils.showToast(uiT('interview.toast.debriefFailed', 'Failed to generate debrief: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Not saved. You can save later from the debrief section.')", "Utils.showToast(uiT('interview.toast.notSavedLater', 'Not saved. You can save later from the debrief section.'))"],
  ["Utils.showToast('Please log in to save your mock interview')", "Utils.showToast(uiT('interview.toast.loginToSave', 'Please log in to save your mock interview'))"],
  ["Utils.showToast('Complete the interview and debrief before saving')", "Utils.showToast(uiT('interview.toast.completeBeforeSave', 'Complete the interview and debrief before saving'))"],
  ["Utils.showToast('Already saved to your account')", "Utils.showToast(uiT('interview.toast.alreadySaved', 'Already saved to your account'))"],
  ["Utils.showToast(response.message || 'Mock interview saved to your account')", "Utils.showToast(response.message || uiT('interview.toast.savedToAccount', 'Mock interview saved to your account'))"],
  ["Utils.showToast(error.message || 'Failed to save mock interview')", "Utils.showToast(error.message || uiT('interview.toast.saveFailed', 'Failed to save mock interview'))"],
  ["Utils.showToast('No debrief report available')", "Utils.showToast(uiT('interview.toast.noDebrief', 'No debrief report available'))"],
  ["Utils.showToast('Debrief downloaded')", "Utils.showToast(uiT('interview.toast.debriefDownloaded', 'Debrief downloaded'))"],
  ["Utils.showToast('Please provide an answer first')", "Utils.showToast(uiT('interview.toast.answerFirst', 'Please provide an answer first'))"],
  ["Utils.showToast('Answer submitted! Check feedback below.')", "Utils.showToast(uiT('interview.toast.answerSubmitted', 'Answer submitted! Check feedback below.'))"],
  ["Utils.showToast('Failed to get feedback: ' + error.message)", "Utils.showToast(uiT('interview.toast.feedbackFailed', 'Failed to get feedback: {msg}', { msg: error.message }))"],
  ["Utils.showToast('Report downloaded')", "Utils.showToast(uiT('interview.toast.reportDownloaded', 'Report downloaded'))"],
  ["Utils.showToast('Session reset')", "Utils.showToast(uiT('interview.toast.sessionReset', 'Session reset'))"],
];
reps.forEach(([a, b]) => {
  if (!s.includes(a)) console.warn('missing:', a.slice(0, 50));
  s = s.split(a).join(b);
});
fs.writeFileSync(p, s);
console.log('patched interview-prep.js');
