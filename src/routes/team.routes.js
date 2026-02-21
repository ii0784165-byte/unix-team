/**
 * Team Routes
 * Team management and membership
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission, requireTeamMembership } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================
// TEAM CRUD OPERATIONS
// ============================================

/**
 * GET /teams
 * List all teams (based on user access)
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, department } = req.query;
  const skip = (page - 1) * limit;

  // Build query
  const where = { isActive: true, deletedAt: null };
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }
  
  if (department) {
    where.department = department;
  }

  // Non-admins can only see their teams
  if (!req.user.roles.includes('admin') && !req.user.roles.includes('hr_manager')) {
    where.members = {
      some: { userId: req.user.userId }
    };
  }

  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      where,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true }
            }
          },
          where: { leftAt: null }
        },
        _count: { select: { projects: true } }
      },
      skip,
      take: parseInt(limit),
      orderBy: { name: 'asc' }
    }),
    prisma.team.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      teams,
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
 * GET /teams/:teamId
 * Get team details
 */
router.get('/:teamId', authenticate, [
  param('teamId').isUUID()
], asyncHandler(async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.teamId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              githubProfile: {
                select: { username: true, profileUrl: true }
              }
            }
          }
        },
        where: { leftAt: null },
        orderBy: { role: 'asc' }
      },
      projects: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          technologies: true
        }
      }
    }
  });

  if (!team) {
    return res.status(404).json({
      success: false,
      error: 'Team not found'
    });
  }

  res.json({
    success: true,
    data: { team }
  });
}));

/**
 * POST /teams
 * Create a new team
 */
router.post('/', authenticate, requirePermission('teams:write'), [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('department').optional().trim().isLength({ max: 50 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, description, department, avatar } = req.body;

  const team = await prisma.team.create({
    data: {
      name,
      description,
      department,
      avatar,
      members: {
        create: {
          userId: req.user.userId,
          role: 'OWNER'
        }
      }
    },
    include: {
      members: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } }
      }
    }
  });

  await logAction(req, AUDIT_ACTIONS.TEAM_CREATED, 'Team', team.id, { name });

  res.status(201).json({
    success: true,
    data: { team }
  });
}));

/**
 * PUT /teams/:teamId
 * Update team
 */
router.put('/:teamId', authenticate, requireTeamMembership('LEAD'), [
  param('teamId').isUUID(),
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 })
], asyncHandler(async (req, res) => {
  const { name, description, department, avatar } = req.body;

  const team = await prisma.team.update({
    where: { id: req.params.teamId },
    data: {
      name,
      description,
      department,
      avatar
    }
  });

  await logAction(req, AUDIT_ACTIONS.TEAM_UPDATED, 'Team', team.id);

  res.json({
    success: true,
    data: { team }
  });
}));

/**
 * DELETE /teams/:teamId
 * Soft delete team
 */
router.delete('/:teamId', authenticate, requireTeamMembership('OWNER'), [
  param('teamId').isUUID()
], asyncHandler(async (req, res) => {
  const team = await prisma.team.update({
    where: { id: req.params.teamId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  await logAction(req, AUDIT_ACTIONS.TEAM_DELETED, 'Team', team.id);

  res.json({
    success: true,
    message: 'Team deleted successfully'
  });
}));

// ============================================
// TEAM MEMBERSHIP
// ============================================

/**
 * POST /teams/:teamId/members
 * Add member to team
 */
router.post('/:teamId/members', authenticate, requireTeamMembership('LEAD'), [
  param('teamId').isUUID(),
  body('userId').isUUID(),
  body('role').isIn(['MEMBER', 'LEAD', 'VIEWER'])
], asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { userId, role } = req.body;

  // Check if user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Check if already a member
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });

  if (existing) {
    return res.status(409).json({ success: false, error: 'User is already a team member' });
  }

  const membership = await prisma.teamMember.create({
    data: { teamId, userId, role },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } }
    }
  });

  await logAction(req, AUDIT_ACTIONS.TEAM_MEMBER_ADDED, 'Team', teamId, {
    memberId: userId,
    role
  });

  res.status(201).json({
    success: true,
    data: { membership }
  });
}));

/**
 * PUT /teams/:teamId/members/:userId
 * Update member role
 */
router.put('/:teamId/members/:userId', authenticate, requireTeamMembership('OWNER'), [
  param('teamId').isUUID(),
  param('userId').isUUID(),
  body('role').isIn(['MEMBER', 'LEAD', 'VIEWER', 'OWNER'])
], asyncHandler(async (req, res) => {
  const { teamId, userId } = req.params;
  const { role } = req.body;

  const membership = await prisma.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { role },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  res.json({
    success: true,
    data: { membership }
  });
}));

/**
 * DELETE /teams/:teamId/members/:userId
 * Remove member from team
 */
router.delete('/:teamId/members/:userId', authenticate, requireTeamMembership('LEAD'), [
  param('teamId').isUUID(),
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  const { teamId, userId } = req.params;

  // Can't remove the last owner
  const owners = await prisma.teamMember.count({
    where: { teamId, role: 'OWNER' }
  });

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });

  if (member?.role === 'OWNER' && owners <= 1) {
    return res.status(400).json({
      success: false,
      error: 'Cannot remove the last owner. Transfer ownership first.'
    });
  }

  await prisma.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { leftAt: new Date() }
  });

  await logAction(req, AUDIT_ACTIONS.TEAM_MEMBER_REMOVED, 'Team', teamId, {
    memberId: userId
  });

  res.json({
    success: true,
    message: 'Member removed from team'
  });
}));

module.exports = router;
