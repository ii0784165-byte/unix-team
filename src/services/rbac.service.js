/**
 * Role-Based Access Control (RBAC) Service
 * Manages roles, permissions, and access control
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

// Permission definitions
const PERMISSIONS = {
  // User management
  'users:read': 'View user profiles',
  'users:write': 'Create and edit users',
  'users:delete': 'Delete users',
  'users:manage_roles': 'Assign and revoke roles',
  
  // Team management
  'teams:read': 'View teams',
  'teams:write': 'Create and edit teams',
  'teams:delete': 'Delete teams',
  'teams:manage_members': 'Add/remove team members',
  
  // Project management
  'projects:read': 'View projects',
  'projects:write': 'Create and edit projects',
  'projects:delete': 'Delete projects',
  'projects:manage': 'Full project management',
  
  // Document management
  'documents:read': 'View documents',
  'documents:write': 'Create and edit documents',
  'documents:delete': 'Delete documents',
  'documents:export': 'Export documents',
  
  // GitHub integration
  'github:read': 'View GitHub profiles and repos',
  'github:write': 'Connect GitHub accounts',
  'github:sync': 'Sync GitHub data',
  
  // AI features
  'ai:analyze': 'Request AI analysis',
  'ai:view_suggestions': 'View AI suggestions',
  
  // HR features
  'hr:view_all': 'View all team data',
  'hr:suggestions': 'Access HR AI suggestions',
  'hr:reports': 'Generate HR reports',
  
  // Admin features
  'admin:dashboard': 'Access admin dashboard',
  'admin:audit_logs': 'View audit logs',
  'admin:security': 'Manage security settings',
  'admin:compliance': 'Manage compliance settings',
  'admin:system': 'System administration',
  
  // Compliance
  'compliance:view': 'View compliance reports',
  'compliance:manage': 'Manage compliance policies',
  'compliance:export': 'Export compliance data'
};

// Default role configurations
const DEFAULT_ROLES = {
  admin: {
    description: 'Full system administrator with all permissions',
    permissions: Object.keys(PERMISSIONS)
  },
  hr_manager: {
    description: 'HR manager with access to all HR features',
    permissions: [
      'users:read', 'teams:read', 'projects:read', 'documents:read',
      'github:read', 'ai:view_suggestions', 'hr:view_all', 'hr:suggestions',
      'hr:reports', 'compliance:view'
    ]
  },
  team_lead: {
    description: 'Team leader with team management capabilities',
    permissions: [
      'users:read', 'teams:read', 'teams:write', 'teams:manage_members',
      'projects:read', 'projects:write', 'projects:manage',
      'documents:read', 'documents:write', 'github:read', 'github:write',
      'github:sync', 'ai:analyze', 'ai:view_suggestions'
    ]
  },
  member: {
    description: 'Standard team member',
    permissions: [
      'users:read', 'teams:read', 'projects:read', 'projects:write',
      'documents:read', 'documents:write', 'github:read', 'github:write',
      'ai:analyze'
    ]
  },
  viewer: {
    description: 'Read-only access to team data',
    permissions: [
      'users:read', 'teams:read', 'projects:read', 'documents:read',
      'github:read'
    ]
  }
};

class RBACService {
  /**
   * Initialize default roles in database
   */
  async initializeRoles() {
    for (const [name, config] of Object.entries(DEFAULT_ROLES)) {
      await prisma.role.upsert({
        where: { name },
        update: {
          description: config.description,
          permissions: config.permissions
        },
        create: {
          name,
          description: config.description,
          permissions: config.permissions,
          isSystem: true
        }
      });
    }
    logger.info('Default roles initialized');
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(userId, permission) {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: { role: true }
    });

    for (const userRole of userRoles) {
      if (userRole.role.permissions.includes(permission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(userId, permissions) {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, permission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has all specified permissions
   */
  async hasAllPermissions(userId, permissions) {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, permission))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if user has specific role
   */
  async hasRole(userId, roleName) {
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: { name: roleName },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    return !!userRole;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId) {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: { role: true }
    });

    const permissions = new Set();
    userRoles.forEach(ur => {
      ur.role.permissions.forEach(p => permissions.add(p));
    });

    return Array.from(permissions);
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId) {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: { role: true }
    });

    return userRoles.map(ur => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
      grantedAt: ur.grantedAt,
      expiresAt: ur.expiresAt
    }));
  }

  /**
   * Assign role to user
   */
  async assignRole(userId, roleName, grantedBy, expiresAt = null) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`Role '${roleName}' not found`);
    }

    const existingAssignment = await prisma.userRole.findFirst({
      where: { userId, roleId: role.id }
    });

    if (existingAssignment) {
      throw new Error(`User already has role '${roleName}'`);
    }

    await prisma.userRole.create({
      data: {
        userId,
        roleId: role.id,
        grantedBy,
        expiresAt
      }
    });

    logger.info(`Role '${roleName}' assigned to user ${userId} by ${grantedBy}`);
  }

  /**
   * Revoke role from user
   */
  async revokeRole(userId, roleName) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`Role '${roleName}' not found`);
    }

    await prisma.userRole.deleteMany({
      where: { userId, roleId: role.id }
    });

    logger.info(`Role '${roleName}' revoked from user ${userId}`);
  }

  /**
   * Create a custom role
   */
  async createRole(name, description, permissions, createdBy) {
    // Validate permissions
    const invalidPerms = permissions.filter(p => !PERMISSIONS[p]);
    if (invalidPerms.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
    }

    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions,
        isSystem: false
      }
    });

    logger.info(`Custom role '${name}' created by ${createdBy}`);
    return role;
  }

  /**
   * Update role permissions
   */
  async updateRole(roleId, updates) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem && updates.name) {
      throw new Error('Cannot rename system roles');
    }

    if (updates.permissions) {
      const invalidPerms = updates.permissions.filter(p => !PERMISSIONS[p]);
      if (invalidPerms.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
      }
    }

    return prisma.role.update({
      where: { id: roleId },
      data: updates
    });
  }

  /**
   * Delete a custom role
   */
  async deleteRole(roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem) {
      throw new Error('Cannot delete system roles');
    }

    // Remove all user assignments first
    await prisma.userRole.deleteMany({ where: { roleId } });
    
    await prisma.role.delete({ where: { id: roleId } });
    logger.info(`Role '${role.name}' deleted`);
  }

  /**
   * Get all available permissions
   */
  getAvailablePermissions() {
    return PERMISSIONS;
  }

  /**
   * Get all roles
   */
  async getAllRoles() {
    return prisma.role.findMany({
      include: {
        _count: {
          select: { users: true }
        }
      }
    });
  }

  /**
   * Check team-level permissions
   */
  async hasTeamPermission(userId, teamId, permission) {
    // First check global permissions
    if (await this.hasPermission(userId, permission)) {
      return true;
    }

    // Then check team membership and role
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId }
      }
    });

    if (!membership) {
      return false;
    }

    // Team owners and leads have elevated permissions within their team
    const teamPermissions = {
      OWNER: ['teams:write', 'teams:manage_members', 'projects:manage', 'documents:write'],
      LEAD: ['teams:manage_members', 'projects:write', 'documents:write'],
      MEMBER: ['projects:read', 'documents:read', 'documents:write'],
      VIEWER: ['projects:read', 'documents:read']
    };

    return teamPermissions[membership.role]?.includes(permission) || false;
  }
}

module.exports = new RBACService();
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.DEFAULT_ROLES = DEFAULT_ROLES;
