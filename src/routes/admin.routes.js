/**
 * Admin Routes
 * System administration and audit logs
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const auditService = require('../services/audit.service');
const rbacService = require('../services/rbac.service');

const router = express.Router();
const prisma = new PrismaClient();

// All admin routes require admin role
router.use(authenticate, requireRole('admin'));

// ============================================
// DASHBOARD
// ============================================

/**
 * GET /admin/dashboard
 * Admin dashboard overview
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const [
    userStats,
    teamStats,
    projectStats,
    recentActivity,
    securityIncidents
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['isActive'],
      _count: { isActive: true }
    }),
    prisma.team.count({ where: { isActive: true, deletedAt: null } }),
    prisma.project.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { status: true }
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } }
      }
    }),
    prisma.securityIncident.count({
      where: { status: { in: ['OPEN', 'INVESTIGATING'] } }
    })
  ]);

  const activeUsers = userStats.find(s => s.isActive === true)?._count?.isActive || 0;
  const inactiveUsers = userStats.find(s => s.isActive === false)?._count?.isActive || 0;

  res.json({
    success: true,
    data: {
      users: {
        total: activeUsers + inactiveUsers,
        active: activeUsers,
        inactive: inactiveUsers
      },
      teams: teamStats,
      projects: {
        total: projectStats.reduce((sum, s) => sum + s._count.status, 0),
        byStatus: projectStats.map(s => ({
          status: s.status,
          count: s._count.status
        }))
      },
      security: {
        openIncidents: securityIncidents
      },
      recentActivity
    }
  });
}));

// ============================================
// AUDIT LOGS
// ============================================

/**
 * GET /admin/audit-logs
 * Get audit logs with filtering
 */
router.get('/audit-logs', asyncHandler(async (req, res) => {
  const { userId, action, resource, status, startDate, endDate, page, limit } = req.query;

  const result = await auditService.getLogs({
    userId,
    action,
    resource,
    status,
    startDate,
    endDate,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /admin/audit-logs/user/:userId
 * Get user activity
 */
router.get('/audit-logs/user/:userId', [
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  const { days } = req.query;

  const result = await auditService.getUserActivity(
    req.params.userId,
    parseInt(days) || 30
  );

  res.json({
    success: true,
    data: result
  });
}));

// ============================================
// SECURITY INCIDENTS
// ============================================

/**
 * GET /admin/security/incidents
 * Get security incidents
 */
router.get('/security/incidents', asyncHandler(async (req, res) => {
  const { type, severity, status, page, limit } = req.query;

  const result = await auditService.getSecurityIncidents({
    type,
    severity,
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * PUT /admin/security/incidents/:incidentId/resolve
 * Resolve a security incident
 */
router.put('/security/incidents/:incidentId/resolve', [
  param('incidentId').isUUID(),
  body('resolution').trim().notEmpty()
], asyncHandler(async (req, res) => {
  const incident = await auditService.resolveIncident(
    req.params.incidentId,
    req.body.resolution,
    req.user.userId
  );

  res.json({
    success: true,
    data: { incident }
  });
}));

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * GET /admin/roles
 * Get all roles
 */
router.get('/roles', asyncHandler(async (req, res) => {
  const roles = await rbacService.getAllRoles();

  res.json({
    success: true,
    data: { roles }
  });
}));

/**
 * GET /admin/roles/permissions
 * Get all available permissions
 */
router.get('/roles/permissions', asyncHandler(async (req, res) => {
  const permissions = rbacService.getAvailablePermissions();

  res.json({
    success: true,
    data: { permissions }
  });
}));

/**
 * POST /admin/roles
 * Create custom role
 */
router.post('/roles', [
  body('name').trim().notEmpty().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 200 }),
  body('permissions').isArray()
], asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;

  const role = await rbacService.createRole(name, description, permissions, req.user.userId);

  res.status(201).json({
    success: true,
    data: { role }
  });
}));

/**
 * PUT /admin/roles/:roleId
 * Update role
 */
router.put('/roles/:roleId', [
  param('roleId').isUUID()
], asyncHandler(async (req, res) => {
  const { description, permissions } = req.body;

  const role = await rbacService.updateRole(req.params.roleId, { description, permissions });

  res.json({
    success: true,
    data: { role }
  });
}));

/**
 * DELETE /admin/roles/:roleId
 * Delete custom role
 */
router.delete('/roles/:roleId', [
  param('roleId').isUUID()
], asyncHandler(async (req, res) => {
  await rbacService.deleteRole(req.params.roleId);

  res.json({
    success: true,
    message: 'Role deleted'
  });
}));

/**
 * POST /admin/users/:userId/roles
 * Assign role to user
 */
router.post('/users/:userId/roles', [
  param('userId').isUUID(),
  body('roleName').trim().notEmpty()
], asyncHandler(async (req, res) => {
  const { roleName, expiresAt } = req.body;

  await rbacService.assignRole(
    req.params.userId,
    roleName,
    req.user.userId,
    expiresAt ? new Date(expiresAt) : null
  );

  res.json({
    success: true,
    message: `Role '${roleName}' assigned successfully`
  });
}));

/**
 * DELETE /admin/users/:userId/roles/:roleName
 * Revoke role from user
 */
router.delete('/users/:userId/roles/:roleName', [
  param('userId').isUUID(),
  param('roleName').notEmpty()
], asyncHandler(async (req, res) => {
  await rbacService.revokeRole(req.params.userId, req.params.roleName);

  res.json({
    success: true,
    message: 'Role revoked successfully'
  });
}));

// ============================================
// SYSTEM
// ============================================

/**
 * POST /admin/system/init-roles
 * Initialize default roles
 */
router.post('/system/init-roles', asyncHandler(async (req, res) => {
  await rbacService.initializeRoles();

  res.json({
    success: true,
    message: 'Default roles initialized'
  });
}));

/**
 * POST /admin/system/cleanup-logs
 * Cleanup old audit logs
 */
router.post('/system/cleanup-logs', asyncHandler(async (req, res) => {
  const deletedCount = await auditService.cleanupOldLogs();

  res.json({
    success: true,
    message: `Cleaned up ${deletedCount} old audit logs`
  });
}));

/**
 * GET /admin/system/health
 * System health check
 */
router.get('/system/health', asyncHandler(async (req, res) => {
  const checks = {
    database: 'unknown',
    timestamp: new Date().toISOString()
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  res.json({
    success: true,
    data: checks
  });
}));

module.exports = router;
