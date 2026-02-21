/**
 * Authentication & Authorization Middleware
 * JWT verification and RBAC enforcement
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const rbacService = require('../services/rbac.service');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if session is still valid
    const session = await prisma.session.findFirst({
      where: {
        token,
        isValid: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (!session) {
      throw new AuthenticationError('Session expired or invalid');
    }

    // Check if user is still active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true, email: true }
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('User account is deactivated');
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roles: decoded.roles,
      permissions: decoded.permissions,
      sessionId: session.id
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AuthenticationError('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Token expired'));
    }
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roles: decoded.roles,
      permissions: decoded.permissions
    };

    next();
  } catch {
    // Silently proceed without auth
    next();
  }
};

/**
 * Check if user has required role(s)
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    const hasRole = roles.some(role => req.user.roles.includes(role));
    
    if (!hasRole) {
      logger.warn(`Access denied: User ${req.user.userId} lacks required role(s): ${roles.join(', ')}`);
      return next(new AuthorizationError(`Requires one of roles: ${roles.join(', ')}`));
    }

    next();
  };
};

/**
 * Check if user has required permission(s)
 */
const requirePermission = (...permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    // Check from JWT first (faster)
    const hasPermission = permissions.some(perm => 
      req.user.permissions.includes(perm)
    );

    if (!hasPermission) {
      // Double-check from database (in case roles changed)
      const dbCheck = await rbacService.hasAnyPermission(
        req.user.userId,
        permissions
      );

      if (!dbCheck) {
        logger.warn(`Access denied: User ${req.user.userId} lacks permission(s): ${permissions.join(', ')}`);
        return next(new AuthorizationError(`Missing required permission`));
      }
    }

    next();
  };
};

/**
 * Check if user has all required permissions
 */
const requireAllPermissions = (...permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    const hasAll = permissions.every(perm => 
      req.user.permissions.includes(perm)
    );

    if (!hasAll) {
      const dbCheck = await rbacService.hasAllPermissions(
        req.user.userId,
        permissions
      );

      if (!dbCheck) {
        logger.warn(`Access denied: User ${req.user.userId} missing permissions`);
        return next(new AuthorizationError('Insufficient permissions'));
      }
    }

    next();
  };
};

/**
 * Check team membership and role
 */
const requireTeamMembership = (minRole = 'VIEWER') => {
  const roleHierarchy = ['VIEWER', 'MEMBER', 'LEAD', 'OWNER'];
  
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    const teamId = req.params.teamId || req.body.teamId;
    
    if (!teamId) {
      return next(new AuthorizationError('Team ID required'));
    }

    // Admins bypass team membership check
    if (req.user.roles.includes('admin')) {
      return next();
    }

    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: req.user.userId
        }
      }
    });

    if (!membership) {
      return next(new AuthorizationError('Not a member of this team'));
    }

    const memberRoleIndex = roleHierarchy.indexOf(membership.role);
    const requiredRoleIndex = roleHierarchy.indexOf(minRole);

    if (memberRoleIndex < requiredRoleIndex) {
      return next(new AuthorizationError(`Requires ${minRole} role or higher in team`));
    }

    // Attach team membership to request
    req.teamMembership = membership;
    next();
  };
};

/**
 * Resource ownership check
 */
const requireOwnership = (resourceField = 'createdBy') => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    // Admins bypass ownership check
    if (req.user.roles.includes('admin')) {
      return next();
    }

    // The resource should be loaded by a previous middleware
    if (!req.resource) {
      return next(new Error('Resource not loaded for ownership check'));
    }

    if (req.resource[resourceField] !== req.user.userId) {
      return next(new AuthorizationError('You do not own this resource'));
    }

    next();
  };
};

/**
 * IP whitelist check for sensitive operations
 */
const requireWhitelistedIP = (whitelist) => {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.connection?.remoteAddress;

    if (!whitelist.includes(ip)) {
      logger.warn(`Blocked access from non-whitelisted IP: ${ip}`);
      return next(new AuthorizationError('Access not allowed from this location'));
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  requireAllPermissions,
  requireTeamMembership,
  requireOwnership,
  requireWhitelistedIP
};
