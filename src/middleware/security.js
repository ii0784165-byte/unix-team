/**
 * Security Middleware
 * Additional security headers and protections
 */

const crypto = require('crypto');

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Generate nonce for CSP
  res.locals.nonce = crypto.randomBytes(16).toString('base64');

  // Permissions-Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', 
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), payment=(), usb=()');

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Cache-Control for API responses
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  // Add request ID for tracing
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);

  next();
};

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potential XSS patterns
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);

  next();
};

/**
 * SQL Injection prevention (basic patterns)
 */
const sqlInjectionGuard = (req, res, next) => {
  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi,
    /((\%27)|(\'))union/gi
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  const checkObject = (obj) => {
    for (const key in obj) {
      if (checkValue(obj[key]) || checkValue(key)) {
        return true;
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkObject(obj[key])) return true;
      }
    }
    return false;
  };

  if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input detected'
    });
  }

  next();
};

/**
 * Prevent parameter pollution
 */
const preventParamPollution = (req, res, next) => {
  // For query params that should only have single values
  const singleValueParams = ['page', 'limit', 'sort', 'order'];
  
  for (const param of singleValueParams) {
    if (Array.isArray(req.query[param])) {
      req.query[param] = req.query[param][0];
    }
  }

  next();
};

/**
 * Validate content type for POST/PUT requests
 */
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type header is required'
      });
    }

    const allowedTypes = [
      'application/json',
      'multipart/form-data',
      'application/x-www-form-urlencoded'
    ];

    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type)
    );

    if (!isAllowed) {
      return res.status(415).json({
        success: false,
        error: 'Unsupported media type'
      });
    }
  }

  next();
};

module.exports = {
  securityHeaders,
  sanitizeInput,
  sqlInjectionGuard,
  preventParamPollution,
  validateContentType
};
