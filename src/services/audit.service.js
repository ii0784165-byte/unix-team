/**
 * Audit Service
 * Comprehensive audit logging and activity monitoring
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

// Audit action types
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  
  // User management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  
  // Role management
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  ROLE_REVOKED: 'ROLE_REVOKED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  
  // Team management
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_UPDATED: 'TEAM_UPDATED',
  TEAM_DELETED: 'TEAM_DELETED',
  TEAM_MEMBER_ADDED: 'TEAM_MEMBER_ADDED',
  TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
  
  // Project management
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_ANALYZED: 'PROJECT_ANALYZED',
  
  // Document management
  DOCUMENT_CREATED: 'DOCUMENT_CREATED',
  DOCUMENT_UPDATED: 'DOCUMENT_UPDATED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_EXPORTED: 'DOCUMENT_EXPORTED',
  DOCUMENT_SYNCED: 'DOCUMENT_SYNCED',
  
  // GitHub integration
  GITHUB_CONNECTED: 'GITHUB_CONNECTED',
  GITHUB_DISCONNECTED: 'GITHUB_DISCONNECTED',
  GITHUB_SYNCED: 'GITHUB_SYNCED',
  
  // AI features
  AI_ANALYSIS_REQUESTED: 'AI_ANALYSIS_REQUESTED',
  AI_SUGGESTION_VIEWED: 'AI_SUGGESTION_VIEWED',
  
  // Data access
  DATA_EXPORTED: 'DATA_EXPORTED',
  DATA_ACCESSED: 'DATA_ACCESSED',
  SENSITIVE_DATA_ACCESSED: 'SENSITIVE_DATA_ACCESSED',
  
  // Security events
  SECURITY_INCIDENT_CREATED: 'SECURITY_INCIDENT_CREATED',
  SECURITY_INCIDENT_RESOLVED: 'SECURITY_INCIDENT_RESOLVED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // Compliance
  GDPR_EXPORT_REQUESTED: 'GDPR_EXPORT_REQUESTED',
  GDPR_DELETE_REQUESTED: 'GDPR_DELETE_REQUESTED',
  COMPLIANCE_REPORT_GENERATED: 'COMPLIANCE_REPORT_GENERATED'
};

class AuditService {
  /**
   * Log an audit event
   */
  async log(options) {
    const {
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      status = 'SUCCESS',
      errorMessage,
      duration
    } = options;

    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          details,
          ipAddress,
          userAgent,
          status,
          errorMessage,
          duration
        }
      });

      // Also log to application logs for monitoring
      const logLevel = status === 'FAILURE' ? 'warn' : 'info';
      logger[logLevel](`Audit: ${action} on ${resource}${resourceId ? `/${resourceId}` : ''}`, {
        userId,
        status,
        ip: ipAddress
      });

      // Check for suspicious patterns
      await this._detectSuspiciousActivity(options);

      return auditLog;
    } catch (error) {
      logger.error('Failed to create audit log:', error);
      // Don't throw - audit logging shouldn't break the application
    }
  }

  /**
   * Detect suspicious activity patterns
   */
  async _detectSuspiciousActivity(event) {
    const { userId, action, ipAddress } = event;

    // Check for multiple failed logins
    if (action === AUDIT_ACTIONS.LOGIN_FAILED && userId) {
      const recentFailures = await prisma.auditLog.count({
        where: {
          userId,
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
        }
      });

      if (recentFailures >= 5) {
        await this._createSecurityIncident({
          type: 'BRUTE_FORCE',
          severity: 'HIGH',
          title: 'Multiple failed login attempts detected',
          description: `User ${userId} has ${recentFailures} failed login attempts in the last 15 minutes from IP ${ipAddress}`,
          affectedUsers: [userId]
        });
      }
    }

    // Check for unusual access patterns
    if (action === AUDIT_ACTIONS.SENSITIVE_DATA_ACCESSED && userId) {
      const recentAccess = await prisma.auditLog.count({
        where: {
          userId,
          action: AUDIT_ACTIONS.SENSITIVE_DATA_ACCESSED,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
        }
      });

      if (recentAccess >= 50) {
        await this._createSecurityIncident({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'MEDIUM',
          title: 'Unusual data access pattern detected',
          description: `User ${userId} has accessed sensitive data ${recentAccess} times in the last hour`,
          affectedUsers: [userId]
        });
      }
    }

    // Check for multiple IPs in short time
    if (userId) {
      const recentIPs = await prisma.auditLog.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
        },
        select: { ipAddress: true },
        distinct: ['ipAddress']
      });

      if (recentIPs.length >= 5) {
        await this._createSecurityIncident({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'MEDIUM',
          title: 'Multiple IP addresses detected',
          description: `User ${userId} has been active from ${recentIPs.length} different IP addresses in the last 30 minutes`,
          affectedUsers: [userId]
        });
      }
    }
  }

  /**
   * Create a security incident
   */
  async _createSecurityIncident(incident) {
    const existing = await prisma.securityIncident.findFirst({
      where: {
        type: incident.type,
        affectedUsers: { hasSome: incident.affectedUsers },
        status: { in: ['OPEN', 'INVESTIGATING'] },
        detectedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
      }
    });

    if (existing) {
      // Update existing incident
      await prisma.securityIncident.update({
        where: { id: existing.id },
        data: {
          description: existing.description + '\n' + incident.description
        }
      });
    } else {
      // Create new incident
      await prisma.securityIncident.create({
        data: incident
      });

      // Send alert (would integrate with notification service)
      logger.warn(`🚨 Security Incident Created: ${incident.title}`, incident);
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getLogs(filters = {}) {
    const {
      userId,
      action,
      resource,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = filters;

    const where = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(userId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [logs, actionCounts] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        _count: { action: true }
      })
    ]);

    return {
      recentActivity: logs,
      actionSummary: actionCounts.map(a => ({
        action: a.action,
        count: a._count.action
      }))
    };
  }

  /**
   * Get security incidents
   */
  async getSecurityIncidents(filters = {}) {
    const { type, severity, status, page = 1, limit = 20 } = filters;

    const where = {};
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const [incidents, total] = await Promise.all([
      prisma.securityIncident.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.securityIncident.count({ where })
    ]);

    return {
      incidents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Resolve security incident
   */
  async resolveIncident(incidentId, resolution, resolvedBy) {
    const incident = await prisma.securityIncident.update({
      where: { id: incidentId },
      data: {
        status: 'RESOLVED',
        resolution,
        resolvedBy,
        resolvedAt: new Date()
      }
    });

    await this.log({
      userId: resolvedBy,
      action: AUDIT_ACTIONS.SECURITY_INCIDENT_RESOLVED,
      resource: 'SecurityIncident',
      resourceId: incidentId,
      details: { resolution }
    });

    return incident;
  }

  /**
   * Generate compliance audit report
   */
  async generateComplianceReport(options) {
    const { startDate, endDate, type = 'GDPR' } = options;

    const dateFilter = {
      gte: new Date(startDate),
      lte: new Date(endDate)
    };

    const [
      dataAccessLogs,
      sensitiveAccessLogs,
      exportRequests,
      deleteRequests,
      securityIncidents,
      userCreations,
      userDeletions
    ] = await Promise.all([
      prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.DATA_ACCESSED, createdAt: dateFilter }
      }),
      prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.SENSITIVE_DATA_ACCESSED, createdAt: dateFilter }
      }),
      prisma.dataExportRequest.count({
        where: { type: 'GDPR_EXPORT', requestedAt: dateFilter }
      }),
      prisma.dataExportRequest.count({
        where: { type: 'GDPR_DELETE', requestedAt: dateFilter }
      }),
      prisma.securityIncident.count({
        where: { detectedAt: dateFilter }
      }),
      prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.USER_CREATED, createdAt: dateFilter }
      }),
      prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.USER_DELETED, createdAt: dateFilter }
      })
    ]);

    return {
      reportType: type,
      period: { startDate, endDate },
      generatedAt: new Date(),
      metrics: {
        dataAccessEvents: dataAccessLogs,
        sensitiveDataAccessEvents: sensitiveAccessLogs,
        gdprExportRequests: exportRequests,
        gdprDeleteRequests: deleteRequests,
        securityIncidents,
        userCreations,
        userDeletions
      }
    };
  }

  /**
   * Cleanup old audit logs based on retention policy
   */
  async cleanupOldLogs() {
    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 365;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    });

    logger.info(`Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
    return result.count;
  }
}

module.exports = new AuditService();
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
