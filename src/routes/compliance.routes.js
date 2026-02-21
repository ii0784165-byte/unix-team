/**
 * Compliance Routes
 * GDPR compliance, data protection, and reporting
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');
const auditService = require('../services/audit.service');
const encryptionService = require('../services/encryption.service');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================
// GDPR DATA SUBJECT REQUESTS
// ============================================

/**
 * POST /compliance/gdpr/export
 * Request personal data export (GDPR Article 15)
 */
router.post('/gdpr/export', authenticate, asyncHandler(async (req, res) => {
  // Check for pending request
  const existingRequest = await prisma.dataExportRequest.findFirst({
    where: {
      userId: req.user.userId,
      type: 'GDPR_EXPORT',
      status: { in: ['PENDING', 'PROCESSING'] }
    }
  });

  if (existingRequest) {
    return res.status(409).json({
      success: false,
      error: 'You already have a pending export request'
    });
  }

  const request = await prisma.dataExportRequest.create({
    data: {
      userId: req.user.userId,
      type: 'GDPR_EXPORT',
      status: 'PENDING'
    }
  });

  await logAction(req, AUDIT_ACTIONS.GDPR_EXPORT_REQUESTED, 'User', req.user.userId);

  res.status(202).json({
    success: true,
    message: 'Export request submitted. You will be notified when ready.',
    data: { requestId: request.id }
  });
}));

/**
 * POST /compliance/gdpr/delete
 * Request account deletion (GDPR Article 17 - Right to be Forgotten)
 */
router.post('/gdpr/delete', authenticate, [
  body('confirmation').equals('DELETE MY ACCOUNT')
], asyncHandler(async (req, res) => {
  const existingRequest = await prisma.dataExportRequest.findFirst({
    where: {
      userId: req.user.userId,
      type: 'GDPR_DELETE',
      status: { in: ['PENDING', 'PROCESSING'] }
    }
  });

  if (existingRequest) {
    return res.status(409).json({
      success: false,
      error: 'You already have a pending deletion request'
    });
  }

  const request = await prisma.dataExportRequest.create({
    data: {
      userId: req.user.userId,
      type: 'GDPR_DELETE',
      status: 'PENDING'
    }
  });

  await logAction(req, AUDIT_ACTIONS.GDPR_DELETE_REQUESTED, 'User', req.user.userId);

  res.status(202).json({
    success: true,
    message: 'Deletion request submitted. Your account will be deleted within 30 days.',
    data: { requestId: request.id }
  });
}));

/**
 * GET /compliance/gdpr/requests
 * Get user's data requests
 */
router.get('/gdpr/requests', authenticate, asyncHandler(async (req, res) => {
  const requests = await prisma.dataExportRequest.findMany({
    where: { userId: req.user.userId },
    orderBy: { requestedAt: 'desc' }
  });

  res.json({
    success: true,
    data: { requests }
  });
}));

/**
 * GET /compliance/gdpr/requests/:requestId/download
 * Download exported data
 */
router.get('/gdpr/requests/:requestId/download', authenticate, [
  param('requestId').isUUID()
], asyncHandler(async (req, res) => {
  const request = await prisma.dataExportRequest.findFirst({
    where: {
      id: req.params.requestId,
      userId: req.user.userId,
      status: 'COMPLETED'
    }
  });

  if (!request) {
    return res.status(404).json({
      success: false,
      error: 'Export not found or not ready'
    });
  }

  if (request.expiresAt && new Date() > request.expiresAt) {
    return res.status(410).json({
      success: false,
      error: 'Export link has expired'
    });
  }

  // In production, this would redirect to secure download URL
  res.json({
    success: true,
    data: {
      downloadUrl: request.downloadUrl,
      expiresAt: request.expiresAt
    }
  });
}));

// ============================================
// ADMIN COMPLIANCE MANAGEMENT
// ============================================

/**
 * GET /compliance/requests
 * List all data requests (admin)
 */
router.get('/requests', authenticate, requirePermission('compliance:manage'), asyncHandler(async (req, res) => {
  const { type, status, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [requests, total] = await Promise.all([
    prisma.dataExportRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { requestedAt: 'desc' }
    }),
    prisma.dataExportRequest.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

/**
 * PUT /compliance/requests/:requestId/process
 * Process a data request (admin)
 */
router.put('/requests/:requestId/process', authenticate, requirePermission('compliance:manage'), [
  param('requestId').isUUID(),
  body('action').isIn(['approve', 'complete', 'reject'])
], asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action, downloadUrl, reason } = req.body;

  const request = await prisma.dataExportRequest.findUnique({
    where: { id: requestId },
    include: { user: true }
  });

  if (!request) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  let updateData = {};

  switch (action) {
    case 'approve':
      updateData = { status: 'PROCESSING' };
      break;

    case 'complete':
      updateData = {
        status: 'COMPLETED',
        processedAt: new Date(),
        downloadUrl: downloadUrl || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      // If deletion request, anonymize user data
      if (request.type === 'GDPR_DELETE') {
        await prisma.user.update({
          where: { id: request.userId },
          data: {
            isActive: false,
            deletedAt: new Date(),
            email: `deleted_${Date.now()}_${request.userId}@deleted.local`,
            firstName: 'Deleted',
            lastName: 'User',
            passwordHash: null,
            mfaSecret: null
          }
        });
      }
      break;

    case 'reject':
      updateData = {
        status: 'FAILED',
        processedAt: new Date()
      };
      break;
  }

  const updated = await prisma.dataExportRequest.update({
    where: { id: requestId },
    data: updateData
  });

  res.json({
    success: true,
    data: { request: updated }
  });
}));

// ============================================
// COMPLIANCE POLICIES
// ============================================

/**
 * GET /compliance/policies
 * Get compliance policies
 */
router.get('/policies', authenticate, requirePermission('compliance:view'), asyncHandler(async (req, res) => {
  const policies = await prisma.compliancePolicy.findMany({
    where: { isActive: true },
    orderBy: { type: 'asc' }
  });

  res.json({
    success: true,
    data: { policies }
  });
}));

/**
 * POST /compliance/policies
 * Create compliance policy
 */
router.post('/policies', authenticate, requirePermission('compliance:manage'), [
  body('name').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('type').notEmpty(),
  body('rules').isObject()
], asyncHandler(async (req, res) => {
  const { name, description, type, rules } = req.body;

  const policy = await prisma.compliancePolicy.create({
    data: { name, description, type, rules }
  });

  res.status(201).json({
    success: true,
    data: { policy }
  });
}));

/**
 * PUT /compliance/policies/:policyId
 * Update compliance policy
 */
router.put('/policies/:policyId', authenticate, requirePermission('compliance:manage'), [
  param('policyId').isUUID()
], asyncHandler(async (req, res) => {
  const { description, rules, isActive } = req.body;

  const policy = await prisma.compliancePolicy.update({
    where: { id: req.params.policyId },
    data: {
      description,
      rules,
      isActive,
      version: { increment: 1 }
    }
  });

  res.json({
    success: true,
    data: { policy }
  });
}));

// ============================================
// COMPLIANCE REPORTS
// ============================================

/**
 * GET /compliance/reports/audit
 * Generate compliance audit report
 */
router.get('/reports/audit', authenticate, requirePermission('compliance:view'), asyncHandler(async (req, res) => {
  const { startDate, endDate, type = 'GDPR' } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: 'Start date and end date are required'
    });
  }

  const report = await auditService.generateComplianceReport({
    startDate,
    endDate,
    type
  });

  await logAction(req, AUDIT_ACTIONS.COMPLIANCE_REPORT_GENERATED, 'Report', null, {
    type,
    period: { startDate, endDate }
  });

  res.json({
    success: true,
    data: { report }
  });
}));

/**
 * GET /compliance/reports/data-retention
 * Data retention compliance report
 */
router.get('/reports/data-retention', authenticate, requirePermission('compliance:view'), asyncHandler(async (req, res) => {
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS) || 730;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [
    usersForDeletion,
    documentsForDeletion,
    auditLogsForDeletion
  ] = await Promise.all([
    prisma.user.count({
      where: {
        isActive: false,
        deletedAt: { lt: cutoffDate }
      }
    }),
    prisma.document.count({
      where: {
        deletedAt: { lt: cutoffDate }
      }
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
      }
    })
  ]);

  res.json({
    success: true,
    data: {
      retentionPolicy: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      },
      pendingDeletion: {
        users: usersForDeletion,
        documents: documentsForDeletion,
        auditLogs: auditLogsForDeletion
      }
    }
  });
}));

/**
 * GET /compliance/reports/security
 * Security compliance report
 */
router.get('/reports/security', authenticate, requirePermission('compliance:view'), asyncHandler(async (req, res) => {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    mfaStats,
    incidentStats,
    failedLogins,
    accessDenied
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['mfaEnabled'],
      where: { isActive: true },
      _count: { mfaEnabled: true }
    }),
    prisma.securityIncident.groupBy({
      by: ['severity'],
      where: { detectedAt: { gte: last30Days } },
      _count: { severity: true }
    }),
    prisma.auditLog.count({
      where: {
        action: 'LOGIN_FAILED',
        createdAt: { gte: last30Days }
      }
    }),
    prisma.auditLog.count({
      where: {
        action: 'ACCESS_DENIED',
        createdAt: { gte: last30Days }
      }
    })
  ]);

  const mfaEnabled = mfaStats.find(s => s.mfaEnabled === true)?._count?.mfaEnabled || 0;
  const mfaDisabled = mfaStats.find(s => s.mfaEnabled === false)?._count?.mfaEnabled || 0;

  res.json({
    success: true,
    data: {
      mfa: {
        enabled: mfaEnabled,
        disabled: mfaDisabled,
        adoptionRate: Math.round((mfaEnabled / (mfaEnabled + mfaDisabled)) * 100)
      },
      incidents: {
        last30Days: incidentStats.reduce((sum, s) => sum + s._count.severity, 0),
        bySeverity: incidentStats.map(s => ({
          severity: s.severity,
          count: s._count.severity
        }))
      },
      security: {
        failedLogins,
        accessDenied
      }
    }
  });
}));

module.exports = router;
