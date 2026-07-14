'use strict';

const DonationModel = require('../models/donation.model');
const ApiError = require('../utils/ApiError');
const {
  LEGAL_SERVICE_PURPOSE,
  getPlatformAccess,
  isVulnerableIndividual,
} = require('../services/access.service');
const UserModel = require('../models/user.model');
const { formatGroupTypesLabel } = require('../constants/groupTypes');

const LEGAL_SERVICES = [
  {
    id: 'labor_rights',
    title: 'Labor rights consultation',
    description: 'Basic labor law advice on contracts, pay, benefits, workplace injury recognition and rights guidance for vulnerable groups.',
    icon: 'balance-scale',
  },
  {
    id: 'cross_border',
    title: 'Cross-border employment guidance',
    description: 'Visa, work permits and social insurance continuity for Greater Bay Area cross-border employment.',
    icon: 'globe-asia',
  },
  {
    id: 'anti_discrimination',
    title: 'Anti-discrimination legal aid',
    description: 'Complaint channels and legal support for age, disability, gender and other employment discrimination.',
    icon: 'shield-alt',
  },
  {
    id: 'disability_employment',
    title: 'Disability employment rights',
    description: 'Reasonable accommodation, accessible workplaces and disability certificate related rights.',
    icon: 'wheelchair',
  },
  {
    id: 'career_return',
    title: 'Career-returning women support',
    description: 'Legal rights and negotiation guidance for re-employment after career gaps.',
    icon: 'female',
  },
];

/**
 * GET /api/donations/stats — public: legal aid fund stats
 */
async function getStats(req, res) {
  const stats = await DonationModel.getStats(LEGAL_SERVICE_PURPOSE);
  res.json({
    success: true,
    data: {
      ...stats,
      purpose: LEGAL_SERVICE_PURPOSE,
      purpose_label: 'Vulnerable-group legal services',
      fund_usage: '100%',
      fund_usage_note: 'All funds raised by the donation box go to vulnerable-group legal services',
    },
  });
}

/**
 * GET /api/donations/legal-services — public: legal services intro
 */
function getLegalServices(req, res) {
  res.json({
    success: true,
    data: {
      title: 'Vulnerable-group legal services',
      subtitle: 'Fully funded by the platform donation box. Users can submit legal requests; lawyers, volunteers or the platform can assist.',
      services: LEGAL_SERVICES,
      contact: {
        hotline: '400-888-GBA1',
        email: 'legal-aid@gba-platform.org',
        hours: 'Mon–Fri 9:00–18:00',
      },
      fund_promise: '100% of donations fund this service — no administrative fees.',
    },
  });
}

/**
 * GET /api/donations/access — current user platform access
 */
async function getAccess(req, res) {
  const access = await getPlatformAccess(req.user.id);
  const user = await UserModel.findById(req.user.id);
  res.json({
    success: true,
    data: {
      ...access,
      group_types_label: formatGroupTypesLabel(user?.group_types),
    },
  });
}

/**
 * GET /api/donations/me — my donation history
 */
async function listMine(req, res) {
  const donations = await DonationModel.listByUser(req.user.id);
  res.json({ success: true, data: { donations } });
}

/**
 * POST /api/donations — donate to the box (simulated payment)
 */
async function createDonation(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found.');

  if (isVulnerableIndividual(user)) {
    throw ApiError.badRequest('You belong to a vulnerable group — platform features are free; no donation required.');
  }

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('Please enter a valid donation amount (greater than 0).');
  }
  if (amount > 99999999) {
    throw ApiError.badRequest('Donation amount exceeds the maximum limit.');
  }

  const message = req.body.message ? String(req.body.message).trim().slice(0, 500) : null;

  const donation = await DonationModel.create({
    userId: req.user.id,
    amount,
    purpose: LEGAL_SERVICE_PURPOSE,
    message,
  });

  const access = await getPlatformAccess(req.user.id);
  const stats = await DonationModel.getStats(LEGAL_SERVICE_PURPOSE);

  res.status(201).json({
    success: true,
    message: 'Thank you for your donation! All funds go to legal aid for vulnerable groups.',
    data: {
      donation,
      access,
      stats,
    },
  });
}

module.exports = {
  getStats,
  getLegalServices,
  getAccess,
  listMine,
  createDonation,
};
