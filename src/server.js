/**
 * Unix Team Platform - Main Server
 * Enterprise-grade application with comprehensive security
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const Redis = require('ioredis');
const passport = require('passport');

// Import configurations and middleware
const { logger, httpLogger } = require('./config/logger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { auditMiddleware } = require('./middleware/audit');
const { securityHeaders } = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const teamRoutes = require('./routes/team.routes');
const projectRoutes = require('./routes/project.routes');
const documentRoutes = require('./routes/document.routes');
const githubRoutes = require('./routes/github.routes');
const aiRoutes = require('./routes/ai.routes');
const adminRoutes = require('./routes/admin.routes');
const complianceRoutes = require('./routes/compliance.routes');

// Import passport strategies
require('./config/passport');

const app = express();

// ============================================
// REDIS SESSION STORE (OPTIONAL)
// ============================================
let redis = null;
let sessionStore = null;

// Only connect to Redis if URL is provided and in production
if (process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
  try {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.warn('Redis error:', err));
    sessionStore = new RedisStore({ client: redis });
  } catch (err) {
    logger.warn('Redis not available, using memory store');
  }
} else {
  logger.info('Using in-memory session store (development mode)');
}

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "https://www.googleapis.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
}));

// Custom security headers
app.use(securityHeaders);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(httpLogger);

// Session management (with optional Redis)
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'unix_team_sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
};

if (sessionStore) {
  sessionConfig.store = sessionStore;
}

app.use(session(sessionConfig));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
app.use(rateLimiter);

// Audit logging
app.use(auditMiddleware);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Root route - API info
app.get('/', (req, res) => {
  res.json({
    name: 'Unix Team Platform API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      teams: '/api/v1/teams',
      projects: '/api/v1/projects',
      documents: '/api/v1/documents',
      github: '/api/v1/github',
      ai: '/api/v1/ai',
      admin: '/api/v1/admin'
    }
  });
});

// ============================================
// API ROUTES
// ============================================
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/teams`, teamRoutes);
app.use(`${API_PREFIX}/projects`, projectRoutes);
app.use(`${API_PREFIX}/documents`, documentRoutes);
app.use(`${API_PREFIX}/github`, githubRoutes);
app.use(`${API_PREFIX}/ai`, aiRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/compliance`, complianceRoutes);

// ============================================
// ERROR HANDLING
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use(errorHandler);

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  // Close Redis connection
  await redis.quit();
  
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Unix Team Platform running on port ${PORT}`);
  logger.info(`📝 API Docs: http://localhost:${PORT}/api-docs`);
  logger.info(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server };
