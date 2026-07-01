'use strict';

const ResumeModel = require('../models/resume.model');
const ApiError = require('../utils/ApiError');

async function getMyResume(req, res) {
  const resume = await ResumeModel.findByUserId(req.user.id);
  res.json({ success: true, data: { resume } });
}

async function saveMyResume(req, res) {
  const { content_json: contentJson, skills_text: skillsText } = req.body;
  if (!contentJson || typeof contentJson !== 'object') {
    throw ApiError.badRequest('简历内容格式不正确');
  }

  const resume = await ResumeModel.upsert(req.user.id, contentJson, skillsText);
  res.json({ success: true, message: '简历已保存', data: { resume } });
}

module.exports = { getMyResume, saveMyResume };
