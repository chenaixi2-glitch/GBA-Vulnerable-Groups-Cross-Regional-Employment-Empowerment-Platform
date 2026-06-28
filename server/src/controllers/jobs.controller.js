'use strict';

const JobModel = require('../models/job.model');
const ApiError = require('../utils/ApiError');

async function list(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
  const { status, search, source } = req.query;

  const data = await JobModel.listJobs({ status, search, source, page, pageSize });
  res.json({ success: true, data });
}

async function getOne(req, res) {
  const job = await JobModel.findById(req.params.id);
  if (!job) throw ApiError.notFound('岗位不存在');
  res.json({ success: true, data: { job } });
}

async function create(req, res) {
  const job = await JobModel.createJob({
    ...req.body,
    company_user_id: req.user?.id || null,
  });
  res.status(201).json({ success: true, message: '岗位发布成功', data: { job } });
}

async function update(req, res) {
  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可编辑');
  }

  const job = await JobModel.updateJob(req.params.id, req.body);
  res.json({ success: true, message: '岗位已更新', data: { job } });
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'interviewing', 'closed'].includes(status)) {
    throw ApiError.badRequest('状态值不合法');
  }

  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可修改状态');
  }

  const job = await JobModel.updateStatus(req.params.id, status);
  res.json({ success: true, message: '状态已更新', data: { job } });
}

async function clone(req, res) {
  const job = await JobModel.cloneJob(req.params.id);
  if (!job) throw ApiError.notFound('仅可克隆企业自建岗位');
  res.status(201).json({ success: true, message: '岗位已克隆', data: { job } });
}

async function remove(req, res) {
  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可删除');
  }

  await JobModel.deleteJob(req.params.id);
  res.json({ success: true, message: '岗位已删除' });
}

module.exports = { list, getOne, create, update, updateStatus, clone, remove };
