/**
 * Audit Middleware
 * Automatically logs API requests to audit trail
 */

const auditService = require('../services/audit.service');
const { AUDIT_ACTIONS } = require('../services/audit.service');

// Map HTTP methods to actions
const METHOD_ACTION_MAP = {
  GET: 'READ',
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE'
};

// Routes that should be audited
const AUDITED_ROUTES = [
  { pattern: /^\/api\/v\d+\/users/, resource: 'User' },
  { pattern: /^\/api\/v\d+\/teams/, resource: 'Team' },
  { pattern: /^\/api\/v\d+\/projects/, resource: 'Project' },
  { pattern: /^\/api\/v\d+\/documents/, resource: 'Document' },
  { pattern: /^\/api\/v\d+\/github/, resource: 'GitHub' },
  { pattern: /^\/api\/v\d+\/ai/, resource: 'AI' },
  { pattern: /^\/api\/v\d+\/admin/, resource: 'Admin' },
  { pattern: /^\/api\/v\d+\/compliance/, resource: 'Compliance' }
];

// Routes that should NOT be audited (high-frequency, low-risk)
const EXCLUDED_ROUTES = [
  /^\/health$/,
  /^\/api\/v\d+\/auth\/refresh$/,
  /^\/api-docs/
];

/**
 * Extract resource ID from URL path
 */
function extractResourceId(path) {
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = path.match(uuidPattern);
  return match ? match[0] : null;
}

/**
 * Get client IP address
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Audit middleware function
 */
const auditMiddleware = (req, res, next) => {
  // Check if route should be excluded
  if (EXCLUDED_ROUTES.some(pattern => pattern.test(req.path))) {
    return next();
  }

  // Find matching resource
  const matchedRoute = AUDITED_ROUTES.find(r => r.pattern.test(req.path));
  if (!matchedRoute) {
    return next();
  }

  const startTime = Date.now();
  const originalEnd = res.end;

  // Override res.end to capture response
  res.end = function(chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);

    const duration = Date.now() - startTime;
    const action = `${METHOD_ACTION_MAP[req.method] || req.method}`;
    
    // Build audit details
    const details = {
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      statusCode: res.statusCode
    };

    // Don't log request body for security
    // But log relevant params for POST/PUT
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      details.bodyKeys = Object.keys(req.body);
    }

    // Determine status
    let status = 'SUCCESS';
    if (res.statusCode >= 400 && res.statusCode < 500) {
      status = 'WARNING';
    } else if (res.statusCode >= 500) {
      status = 'FAILURE';
    }

    // Log asynchronously (don't block response)
    setImmediate(() => {
      auditService.log({
        userId: req.user?.userId || null,
        action: `${matchedRoute.resource.toUpperCase()}_${action}`,
        resource: matchedRoute.resource,
        resourceId: extractResourceId(req.path),
        details,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        status,
        duration
      }).catch(() => {}); // Ignore audit errors
    });
  };

  next();
};

/**
 * Explicit audit logging for specific actions
 */
const logAction = async (req, action, resource, resourceId, details = {}) => {
  return auditService.log({
    userId: req.user?.userId || null,
    action,
    resource,
    resourceId,
    details,
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent']
  });
};

module.exports = {
  auditMiddleware,
  logAction,
  getClientIP
};
