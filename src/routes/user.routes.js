/**
 * User Routes
 * User profile management
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /users/me
 * Get current user profile
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      phone: true,
      isVerified: true,
      mfaEnabled: true,
      lastLogin: true,
      createdAt: true,
      roles: {
        include: { role: { select: { name: true, description: true } } }
      },
      teamMemberships: {
        where: { leftAt: null },
        include: {
          team: { select: { id: true, name: true, avatar: true } }
        }
      },
      githubProfile: {
        select: {
          username: true,
          profileUrl: true,
          avatarUrl: true,
          publicRepos: true,
          followers: true,
          topLanguages: true
        }
      }
    }
  });

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * PUT /users/me
 * Update current user profile
 */
router.put('/me', authenticate, [
  body('firstName').optional().trim().isLength({ max: 50 }),
  body('lastName').optional().trim().isLength({ max: 50 }),
  body('phone').optional().isMobilePhone()
], asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, avatar } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { firstName, lastName, phone, avatar },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      phone: true
    }
  });

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * GET /users
 * List all users (admin/hr)
 */
router.get('/', authenticate, requirePermission('users:read'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role, isActive } = req.query;
  const skip = (page - 1) * limit;

  const where = {};

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }

  if (role) {
    where.roles = {
      some: { role: { name: role } }
    };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        createdAt: true,
        roles: {
          include: { role: { select: { name: true } } }
        },
        teamMemberships: {
          where: { leftAt: null },
          include: { team: { select: { name: true } } }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      users,
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
 * GET /users/:userId
 * Get user by ID
 */
router.get('/:userId', authenticate, requirePermission('users:read'), [
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      phone: true,
      isActive: true,
      isVerified: true,
      mfaEnabled: true,
      lastLogin: true,
      createdAt: true,
      roles: {
        include: { role: true }
      },
      teamMemberships: {
        where: { leftAt: null },
        include: { team: true }
      },
      githubProfile: true
    }
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * PUT /users/:userId/status
 * Activate/deactivate user
 */
router.put('/:userId/status', authenticate, requirePermission('users:write'), [
  param('userId').isUUID(),
  body('isActive').isBoolean()
], asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isActive: req.body.isActive },
    select: { id: true, email: true, isActive: true }
  });

  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * DELETE /users/:userId
 * Soft delete user (GDPR compliant)
 */
router.delete('/:userId', authenticate, requirePermission('users:delete'), [
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.userId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      email: `deleted_${Date.now()}_${req.params.userId}@deleted.local`,
      firstName: 'Deleted',
      lastName: 'User'
    }
  });

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

module.exports = router;
