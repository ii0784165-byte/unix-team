/**
 * Rate Limiter Middleware
 * Prevents abuse and DDoS attacks
 * Uses in-memory store for development, Redis for production
 */

const { logger } = require('../config/logger');

// In-memory store for development
const memoryStore = new Map();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.resetTime < now) {
      memoryStore.delete(key);
    }
  }
}, 60000); // Clean every minute

// Rate limit configurations for different endpoints
const RATE_LIMITS = {
  // Default limit
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  },
  // Stricter limits for auth endpoints
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10 // 10 login attempts per 15 minutes
  },
  // API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 60
  },
  // AI endpoints (expensive)
  ai: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20
  },
  // Export/Download endpoints
  export: {
    windowMs: 60 * 60 * 1000,
    max: 10
  }
};

/**
 * Get rate limit configuration for route
 */
function getRateLimitConfig(path) {
  if (path.includes('/auth/login') || path.includes('/auth/register')) {
    return RATE_LIMITS.auth;
  }
  if (path.includes('/ai/')) {
    return RATE_LIMITS.ai;
  }
  if (path.includes('/export') || path.includes('/download')) {
    return RATE_LIMITS.export;
  }
  if (path.startsWith('/api/')) {
    return RATE_LIMITS.api;
  }
  return RATE_LIMITS.default;
}

/**
 * Get client identifier for rate limiting
 */
function getClientId(req) {
  // Use user ID if authenticated, otherwise IP
  if (req.user?.userId) {
    return `user:${req.user.userId}`;
  }
  
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Rate limiter middleware using in-memory sliding window
 */
const rateLimiter = async (req, res, next) => {
  try {
    const config = getRateLimitConfig(req.path);
    const clientId = getClientId(req);
    const key = `ratelimit:${req.path}:${clientId}`;
    
    const now = Date.now();
    
    // Get or create rate limit data
    let data = memoryStore.get(key);
    if (!data || data.resetTime < now) {
      data = { count: 0, resetTime: now + config.windowMs };
      memoryStore.set(key, data);
    }
    
    // Increment count
    data.count++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - data.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000));
    
    if (data.count > config.max) {
      const retryAfter = Math.ceil((data.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      logger.warn(`Rate limit exceeded for ${clientId} on ${req.path}`);
      
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter
      });
    }
    
    next();
  } catch (error) {
    // If rate limiter fails, allow request (fail open)
    logger.error('Rate limiter error:', error);
    next();
  }
};

/**
 * Create custom rate limiter for specific use cases
 */
const createRateLimiter = (options) => {
  const { windowMs, max, keyPrefix = 'custom' } = options;
  
  return async (req, res, next) => {
    try {
      const clientId = getClientId(req);
      const key = `ratelimit:${keyPrefix}:${clientId}`;
      
      const now = Date.now();
      
      let data = memoryStore.get(key);
      if (!data || data.resetTime < now) {
        data = { count: 0, resetTime: now + windowMs };
        memoryStore.set(key, data);
      }
      
      data.count++;
      
      if (data.count > max) {
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Custom rate limiter error:', error);
      next();
    }
  };
};

/**
 * Reset rate limit for a user (useful after password reset, etc.)
 */
const resetRateLimit = async (userId) => {
  for (const [key] of memoryStore.entries()) {
    if (key.includes(`user:${userId}`)) {
      memoryStore.delete(key);
    }
  }
  logger.info(`Rate limit reset for user ${userId}`);
};

module.exports = {
  rateLimiter,
  createRateLimiter,
  resetRateLimit,
  RATE_LIMITS
};
