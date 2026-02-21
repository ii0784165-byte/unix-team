/**
 * Logger Configuration
 * Winston-based logging with rotation and multiple transports
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const morgan = require('morgan');

// Log directory
const LOG_DIR = process.env.LOG_DIR || 'logs';

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// JSON format for production
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      customFormat
    )
  })
);

// File transports (production)
if (process.env.NODE_ENV === 'production') {
  // Combined log
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat
    })
  );

  // Error log
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error',
      format: jsonFormat
    })
  );

  // Security/Audit log
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '365d',
      level: 'warn',
      format: jsonFormat
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports,
  exitOnError: false
});

// HTTP request logger using Morgan
const httpLoggerFormat = ':method :url :status :res[content-length] - :response-time ms';

const httpLogger = morgan(httpLoggerFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  },
  skip: (req) => {
    // Skip health check and static file logs
    return req.url === '/health' || req.url.startsWith('/static');
  }
});

// Security event logger
const securityLogger = {
  loginAttempt: (userId, success, ip) => {
    logger.warn('Login attempt', { event: 'LOGIN', userId, success, ip });
  },
  
  accessDenied: (userId, resource, reason) => {
    logger.warn('Access denied', { event: 'ACCESS_DENIED', userId, resource, reason });
  },
  
  suspiciousActivity: (type, details) => {
    logger.warn('Suspicious activity detected', { event: 'SUSPICIOUS', type, ...details });
  },
  
  dataAccess: (userId, resource, resourceId) => {
    logger.info('Sensitive data accessed', { event: 'DATA_ACCESS', userId, resource, resourceId });
  }
};

module.exports = {
  logger,
  httpLogger,
  securityLogger
};
