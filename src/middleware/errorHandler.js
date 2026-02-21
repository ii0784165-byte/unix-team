/**
 * Error Handler Middleware
 * Centralized error handling with proper logging
 */

const { logger } = require('../config/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter) {
    super('Too many requests', 429, 'RATE_LIMITED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Error response formatter
 */
const formatError = (err, req) => {
  const response = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  };

  // Include validation details if present
  if (err.details) {
    response.error.details = err.details;
  }

  // Include retry-after for rate limit errors
  if (err.retryAfter) {
    response.error.retryAfter = err.retryAfter;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  return response;
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default status code
  let statusCode = err.statusCode || 500;

  // Handle specific error types
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    err.message = 'Invalid token';
    err.code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    err.message = 'Token expired';
    err.code = 'TOKEN_EXPIRED';
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    err.code = 'VALIDATION_ERROR';
  }

  // Prisma errors
  if (err.code === 'P2002') {
    statusCode = 409;
    err.message = 'A record with this value already exists';
    err.code = 'DUPLICATE_ENTRY';
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    err.message = 'Record not found';
    err.code = 'NOT_FOUND';
  }

  // Log error
  const logData = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    userId: req.user?.userId,
    ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    error: {
      name: err.name,
      message: err.message,
      code: err.code
    }
  };

  if (statusCode >= 500) {
    logger.error('Server error:', { ...logData, stack: err.stack });
  } else if (statusCode >= 400) {
    logger.warn('Client error:', logData);
  }

  // Send response
  res.status(statusCode).json(formatError(err, req));
};

/**
 * Async handler wrapper to catch async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'ROUTE_NOT_FOUND'
    },
    requestId: req.requestId
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};
