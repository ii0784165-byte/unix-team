/**
 * Authentication Routes
 * Handles login, registration, MFA, and OAuth
 */

const express = require('express');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('firstName').trim().notEmpty().isLength({ max: 50 }),
  body('lastName').trim().notEmpty().isLength({ max: 50 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

// ============================================
// LOCAL AUTHENTICATION
// ============================================

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register', registerValidation, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await authService.register(req.body);
  
  await logAction(req, AUDIT_ACTIONS.USER_CREATED, 'User', user.id, {
    method: 'registration'
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email.',
    data: { user }
  });
}));

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', loginValidation, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const userAgent = req.headers['user-agent'];

  const result = await authService.login(email, password, ipAddress, userAgent);

  // If MFA is required
  if (result.requiresMfa) {
    return res.json({
      success: true,
      requiresMfa: true,
      tempToken: result.tempToken
    });
  }

  await logAction(req, AUDIT_ACTIONS.LOGIN, 'User', result.user.id, {
    method: 'password'
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/mfa/verify
 * Verify MFA code during login
 */
router.post('/mfa/verify', [
  body('userId').isUUID(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  body('tempToken').notEmpty()
], asyncHandler(async (req, res) => {
  const { userId, code, tempToken } = req.body;
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const userAgent = req.headers['user-agent'];

  const result = await authService.verifyMfa(userId, code, tempToken, ipAddress, userAgent);

  await logAction(req, AUDIT_ACTIONS.LOGIN, 'User', userId, {
    method: 'mfa'
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/mfa/setup
 * Initialize MFA setup
 */
router.post('/mfa/setup', authenticate, asyncHandler(async (req, res) => {
  const result = await authService.setupMfa(req.user.userId);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/mfa/confirm
 * Confirm MFA setup with verification code
 */
router.post('/mfa/confirm', authenticate, [
  body('code').isLength({ min: 6, max: 6 }).isNumeric()
], asyncHandler(async (req, res) => {
  const result = await authService.confirmMfa(req.user.userId, req.body.code);

  await logAction(req, AUDIT_ACTIONS.MFA_ENABLED, 'User', req.user.userId);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/mfa/disable
 * Disable MFA
 */
router.post('/mfa/disable', authenticate, [
  body('password').notEmpty()
], asyncHandler(async (req, res) => {
  const result = await authService.disableMfa(req.user.userId, req.body.password);

  await logAction(req, AUDIT_ACTIONS.MFA_DISABLED, 'User', req.user.userId);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', [
  body('refreshToken').notEmpty()
], asyncHandler(async (req, res) => {
  const result = await authService.refreshToken(req.body.refreshToken);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /auth/logout
 * Logout current session
 */
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(' ')[1];

  await authService.logout(token);
  
  await logAction(req, AUDIT_ACTIONS.LOGOUT, 'User', req.user.userId);

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * POST /auth/logout-all
 * Logout from all devices
 */
router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
  await authService.logoutAllDevices(req.user.userId);

  await logAction(req, AUDIT_ACTIONS.LOGOUT, 'User', req.user.userId, {
    allDevices: true
  });

  res.json({
    success: true,
    message: 'Logged out from all devices'
  });
}));

/**
 * POST /auth/change-password
 * Change password
 */
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
], asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  await authService.changePassword(req.user.userId, currentPassword, newPassword);

  await logAction(req, AUDIT_ACTIONS.PASSWORD_CHANGED, 'User', req.user.userId);

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.'
  });
}));

// ============================================
// OAUTH ROUTES
// ============================================

/**
 * GET /auth/google
 * Initiate Google OAuth
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly']
}));

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed' }),
  asyncHandler(async (req, res) => {
    // Generate tokens for the authenticated user
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(
      req.user.email,
      null, // No password for OAuth
      ipAddress,
      userAgent
    );

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`;
    res.redirect(redirectUrl);
  })
);

/**
 * GET /auth/github
 * Initiate GitHub OAuth
 */
router.get('/github', passport.authenticate('github', {
  scope: ['user:email', 'read:user', 'repo']
}));

/**
 * GET /auth/github/callback
 * GitHub OAuth callback
 */
router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login?error=oauth_failed' }),
  asyncHandler(async (req, res) => {
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(
      req.user.email,
      null,
      ipAddress,
      userAgent
    );

    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`;
    res.redirect(redirectUrl);
  })
);

module.exports = router;
