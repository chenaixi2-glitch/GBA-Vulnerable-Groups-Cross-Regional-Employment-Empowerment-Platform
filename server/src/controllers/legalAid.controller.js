'use strict';

const LegalAidModel = require('../models/legalAid.model');
const UserModel = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const {
  LEGAL_AID_CATEGORIES,
  REQUEST_STATUS,
  HELPER_ROLES,
  VALID_HELPER_ROLES,
  isValidCategory,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} = require('../constants/legalAid');

function sanitizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ATTACHMENTS).map((item) => {
    const name = String(item?.name || 'attachment').slice(0, 200);
    const mime = String(item?.mime || 'application/octet-stream').slice(0, 100);
    const data = item?.data_base64 ? String(item.data_base64) : '';
    const size = data ? Math.ceil((data.length * 3) / 4) : Number(item?.size || 0);
    if (size > MAX_ATTACHMENT_BYTES) {
      throw ApiError.badRequest(`Attachment "${name}" exceeds the ${MAX_ATTACHMENT_BYTES / 1024}KB limit`);
    }
    return { name, mime, size, data_base64: data || null };
  });
}

function canViewFullContact(user, request) {
  if (!user || !request) return false;
  if (user.role === 'admin') return true;
  if (user.id === request.applicant_user_id) return true;
  if (user.id === request.assignee_user_id) return true;
  if ((request.responses || []).some((r) => r.helper_user_id === user.id)) return true;
  return false;
}

function toPublicRequest(request, viewer) {
  if (!request) return null;
  const viewerObj = typeof viewer === 'object' ? viewer : { id: viewer };
  const viewerId = viewerObj.id;
  const fullAccess = canViewFullContact(viewerObj, request);
  const isApplicant = viewerId === request.applicant_user_id;
  const isHelper = (request.responses || []).some((r) => r.helper_user_id === viewerId);

  const out = { ...request };
  if (!fullAccess && !isHelper) {
    out.contact_phone = request.contact_phone ? request.contact_phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2') : null;
    out.contact_email = request.contact_email ? request.contact_email.replace(/(.{2}).+(@.+)/, '$1***$2') : null;
  }
  if (!isApplicant && !isHelper) {
    out.attachments = (request.attachments || []).map((a) => ({
      name: a.name,
      mime: a.mime,
      size: a.size,
      has_content: Boolean(a.data_base64),
    }));
  }

  if (Array.isArray(out.responses)) {
    out.responses = out.responses.map((resp) => {
      const canSeeContact = isApplicant || resp.helper_user_id === viewerId || viewerObj.role === 'admin';
      return {
        ...resp,
        contact: canSeeContact ? resp.contact : resp.contact ? '***' : null,
      };
    });
  }

  out.viewer_has_helped = (request.responses || []).some((r) => r.helper_user_id === viewerId);
  out.viewer_response = (request.responses || []).find((r) => r.helper_user_id === viewerId) || null;

  return out;
}

async function attachAndMap(requests, viewer) {
  const withResponses = await LegalAidModel.attachResponses(requests);
  return withResponses.map((r) => toPublicRequest(r, viewer));
}

/** GET /api/legal-aid/meta */
function getMeta(req, res) {
  res.json({
    success: true,
    data: {
      categories: LEGAL_AID_CATEGORIES,
      statuses: REQUEST_STATUS,
      helper_roles: HELPER_ROLES,
      max_attachments: MAX_ATTACHMENTS,
      max_attachment_kb: MAX_ATTACHMENT_BYTES / 1024,
    },
  });
}

/** POST /api/legal-aid/requests */
async function createFlowRequest(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role !== 'individual' && user.role !== 'admin') {
    throw ApiError.forbidden('Only individual users can submit legal aid requests.');
  }

  const category = req.body.category;
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const preferPlatform = Boolean(req.body.prefer_platform);

  if (!isValidCategory(category)) throw ApiError.badRequest('Please select a valid request category.');
  if (!title || title.length > 200) throw ApiError.badRequest('Please enter a request title (max 200 characters).');
  if (!description || description.length < 10) {
    throw ApiError.badRequest('Please describe your legal request in detail (at least 10 characters).');
  }

  const attachments = sanitizeAttachments(req.body.attachments);

  let status = 'pending';
  let platformNote = null;
  if (preferPlatform) {
    status = 'platform_assisting';
    platformNote = 'Applicant requested platform assistance to connect with lawyers or legal resources.';
  }

  const request = await LegalAidModel.create({
    applicantUserId: req.user.id,
    category,
    title,
    description,
    attachments,
    contactPhone: req.body.contact_phone || user.phone,
    contactEmail: req.body.contact_email || user.email,
    preferPlatform,
    status,
    platformNote,
  });

  res.status(201).json({
    success: true,
    message: preferPlatform
      ? 'Request submitted. The platform will help connect you with suitable legal resources.'
      : 'Request submitted. Waiting for a lawyer or volunteer to offer help.',
    data: { request: toPublicRequest({ ...request, responses: [] }, req.user) },
  });
}

/** GET /api/legal-aid/requests/mine */
async function listMine(req, res) {
  const requests = await LegalAidModel.listByApplicant(req.user.id, { completed: false });
  res.json({
    success: true,
    data: {
      requests: await attachAndMap(requests, req.user),
    },
  });
}

/** GET /api/legal-aid/requests/mine/completed */
async function listMineCompleted(req, res) {
  const requests = await LegalAidModel.listByApplicant(req.user.id, { completed: true });
  res.json({
    success: true,
    data: {
      requests: await attachAndMap(requests, req.user),
    },
  });
}

/** GET /api/legal-aid/requests/assigned */
async function listAssigned(req, res) {
  const requests = await LegalAidModel.listByHelper(req.user.id);
  res.json({
    success: true,
    data: {
      requests: await attachAndMap(requests, req.user),
    },
  });
}

/** GET /api/legal-aid/requests/open */
async function listOpen(req, res) {
  const requests = await LegalAidModel.listOpen(req.user.id);
  res.json({
    success: true,
    data: {
      requests: await attachAndMap(requests, req.user),
    },
  });
}

/** GET /api/legal-aid/requests/:id */
async function getOne(req, res) {
  const request = await LegalAidModel.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found.');

  const [withResponses] = await attachAndMap([request], req.user);
  const isApplicant = request.applicant_user_id === req.user.id;
  const isHelper = (withResponses.responses || []).some((r) => r.helper_user_id === req.user.id);
  const isOpen = !['completed', 'cancelled'].includes(request.status);

  if (!isApplicant && !isHelper && !isOpen && req.user.role !== 'admin') {
    throw ApiError.forbidden('You do not have permission to view this request.');
  }

  res.json({
    success: true,
    data: { request: withResponses },
  });
}

/** POST /api/legal-aid/requests/:id/accept */
async function acceptRequest(req, res) {
  const request = await LegalAidModel.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found.');
  if (request.applicant_user_id === req.user.id) {
    throw ApiError.badRequest('You cannot offer help on your own request.');
  }
  if (['completed', 'cancelled'].includes(request.status)) {
    throw ApiError.badRequest('This request is closed.');
  }

  const existing = await LegalAidModel.findResponse(request.id, req.user.id);
  if (existing) throw ApiError.badRequest('You have already offered help on this request.');

  const assigneeRole = req.body.helper_role || 'volunteer';
  if (!VALID_HELPER_ROLES.includes(assigneeRole)) {
    throw ApiError.badRequest('Please select a valid helper role.');
  }

  const assigneeNote = req.body.note ? String(req.body.note).trim().slice(0, 500) : null;
  const assigneeContact = req.body.contact
    ? String(req.body.contact).trim().slice(0, 120)
    : null;

  await LegalAidModel.addResponse(request.id, {
    helperUserId: req.user.id,
    helperRole: assigneeRole,
    helperNote: assigneeNote,
    helperContact: assigneeContact,
  });

  const updated = await LegalAidModel.findById(request.id);
  const [mapped] = await attachAndMap([updated], req.user);
  res.json({
    success: true,
    message: 'Your legal help has been recorded. The request remains visible for others. Please contact the applicant soon.',
    data: { request: mapped },
  });
}

/** POST /api/legal-aid/requests/:id/platform-assist */
async function platformAssist(req, res) {
  const request = await LegalAidModel.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found.');

  const isApplicant = request.applicant_user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isApplicant && !isAdmin) {
    throw ApiError.forbidden('Only the applicant or an admin can request platform assistance.');
  }
  if (!['pending', 'platform_assisting'].includes(request.status) && !isAdmin) {
    throw ApiError.badRequest('This request cannot be switched to platform assistance in its current status.');
  }

  const platformNote =
    String(req.body.platform_note || '').trim().slice(0, 1000) ||
    (isAdmin
      ? 'A platform admin has stepped in to help connect suitable legal resources.'
      : 'Applicant requested platform assistance to connect with lawyers or legal volunteers.');

  const ok = await LegalAidModel.requestPlatformAssist(request.id, { platformNote });
  if (!ok && !isAdmin) throw ApiError.badRequest('Unable to update to platform assistance status.');
  if (!ok && isAdmin) await LegalAidModel.updateStatus(request.id, 'platform_assisting', { platformNote });

  const updated = await LegalAidModel.findById(request.id);
  const [mapped] = await attachAndMap([updated], req.user);
  res.json({
    success: true,
    message: 'Marked for platform assistance. Staff will connect legal resources shortly.',
    data: { request: mapped },
  });
}

/** PATCH /api/legal-aid/requests/:id/status */
async function updateStatus(req, res) {
  const request = await LegalAidModel.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found.');

  const status = req.body.status;
  const allowed = ['in_progress', 'resolved', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw ApiError.badRequest('Invalid status.');

  const isApplicant = request.applicant_user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  const isHelper = Boolean(await LegalAidModel.findResponse(request.id, req.user.id));

  if (status === 'cancelled') {
    if (!isApplicant && !isAdmin) throw ApiError.forbidden('Only the applicant can cancel the request.');
    const ok = await LegalAidModel.cancelByApplicant(request.id, req.user.id);
    if (!ok && !isAdmin) throw ApiError.badRequest('This request cannot be cancelled in its current status.');
    if (isAdmin && !ok) await LegalAidModel.updateStatus(request.id, 'cancelled');
  } else if (status === 'completed') {
    if (!isApplicant && !isAdmin) throw ApiError.forbidden('Only the applicant can mark the request as completed.');
    const ok = await LegalAidModel.completeByApplicant(request.id, req.user.id);
    if (!ok && !isAdmin) throw ApiError.badRequest('This request cannot be marked completed in its current status.');
    if (isAdmin && !ok) await LegalAidModel.updateStatus(request.id, 'completed');
  } else if (status === 'resolved' || status === 'in_progress') {
    if (!isHelper && !isAdmin) throw ApiError.forbidden('Only helpers can update progress status.');
    await LegalAidModel.updateStatus(request.id, status);
  }

  const updated = await LegalAidModel.findById(request.id);
  const [mapped] = await attachAndMap([updated], req.user);
  res.json({
    success: true,
    message: status === 'completed' ? 'Request marked as completed.' : 'Status updated.',
    data: { request: mapped },
  });
}

module.exports = {
  getMeta,
  createRequest: createFlowRequest,
  listMine,
  listMineCompleted,
  listAssigned,
  listOpen,
  getOne,
  acceptRequest,
  platformAssist,
  updateStatus,
};
