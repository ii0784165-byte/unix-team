/**
 * Authentication Service
 * Handles user authentication, JWT tokens, and MFA
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('./encryption.service');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

class AuthService {
  constructor() {
    this.saltRounds = 12;
    this.maxFailedAttempts = 5;
    this.lockoutDuration = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Register a new user
   */
  async register(userData) {
    const { email, password, firstName, lastName } = userData;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        isVerified: false
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true
      }
    });

    // Assign default role
    const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });
    if (memberRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: memberRole.id
        }
      });
    }

    logger.info(`New user registered: ${email}`);
    return user;
  }

  /**
   * Authenticate user with email and password
   */
  async login(email, password, ipAddress, userAgent) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: { role: true }
        }
      }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockedUntil - new Date()) / 60000);
      throw new Error(`Account locked. Try again in ${remainingTime} minutes`);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedCount = user.failedLoginCount + 1;
      const updateData = { failedLoginCount: failedCount };
      
      if (failedCount >= this.maxFailedAttempts) {
        updateData.lockedUntil = new Date(Date.now() + this.lockoutDuration);
        logger.warn(`Account locked due to failed attempts: ${email}`);
      }
      
      await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
      
      throw new Error('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLogin: new Date()
      }
    });

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      return {
        requiresMfa: true,
        userId: user.id,
        tempToken: this._generateTempToken(user.id)
      };
    }

    // Generate tokens
    const tokens = await this._generateTokens(user, ipAddress, userAgent);
    
    logger.info(`User logged in: ${email}`);
    return {
      user: this._sanitizeUser(user),
      ...tokens
    };
  }

  /**
   * Verify MFA code and complete login
   */
  async verifyMfa(userId, code, tempToken, ipAddress, userAgent) {
    // Verify temp token
    const decoded = this._verifyTempToken(tempToken);
    if (decoded.userId !== userId) {
      throw new Error('Invalid MFA session');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } }
      }
    });

    if (!user || !user.mfaEnabled) {
      throw new Error('MFA not configured');
    }

    // Decrypt MFA secret
    const mfaSecret = encryptionService.decrypt(user.mfaSecret);

    // Verify TOTP code
    const isValid = speakeasy.totp.verify({
      secret: mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1 // Allow 1 step tolerance
    });

    if (!isValid) {
      throw new Error('Invalid MFA code');
    }

    // Generate tokens
    const tokens = await this._generateTokens(user, ipAddress, userAgent);
    
    logger.info(`MFA verified for user: ${user.email}`);
    return {
      user: this._sanitizeUser(user),
      ...tokens
    };
  }

  /**
   * Setup MFA for user
   */
  async setupMfa(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.mfaEnabled) {
      throw new Error('MFA is already enabled');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `UnixTeam:${user.email}`,
      issuer: 'Unix Team Platform'
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Store encrypted secret temporarily (not enabled yet)
    const encryptedSecret = encryptionService.encrypt(secret.base32);
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encryptedSecret }
    });

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: this._generateBackupCodes()
    };
  }

  /**
   * Confirm and enable MFA
   */
  async confirmMfa(userId, code) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.mfaSecret) {
      throw new Error('MFA setup not initiated');
    }

    const mfaSecret = encryptionService.decrypt(user.mfaSecret);

    const isValid = speakeasy.totp.verify({
      secret: mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!isValid) {
      throw new Error('Invalid verification code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true }
    });

    logger.info(`MFA enabled for user: ${user.email}`);
    return { success: true, message: 'MFA enabled successfully' };
  }

  /**
   * Disable MFA
   */
  async disableMfa(userId, password) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    // Verify password before disabling MFA
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null
      }
    });

    logger.info(`MFA disabled for user: ${user.email}`);
    return { success: true, message: 'MFA disabled successfully' };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      const session = await prisma.session.findFirst({
        where: {
          refreshToken,
          isValid: true,
          expiresAt: { gt: new Date() }
        },
        include: {
          user: {
            include: {
              roles: { include: { role: true } }
            }
          }
        }
      });

      if (!session) {
        throw new Error('Invalid or expired refresh token');
      }

      // Generate new access token
      const accessToken = this._generateAccessToken(session.user);

      return { accessToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logout - invalidate session
   */
  async logout(sessionToken) {
    await prisma.session.updateMany({
      where: { token: sessionToken },
      data: { isValid: false }
    });
  }

  /**
   * Logout from all devices
   */
  async logoutAllDevices(userId) {
    await prisma.session.updateMany({
      where: { userId },
      data: { isValid: false }
    });
    
    logger.info(`All sessions invalidated for user: ${userId}`);
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, this.saltRounds);
    
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    });

    // Invalidate all sessions
    await this.logoutAllDevices(userId);

    logger.info(`Password changed for user: ${user.email}`);
    return { success: true };
  }

  // Private helper methods

  async _generateTokens(user, ipAddress, userAgent) {
    const accessToken = this._generateAccessToken(user);
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });

    return { accessToken, refreshToken };
  }

  _generateAccessToken(user) {
    const roles = user.roles?.map(ur => ur.role.name) || [];
    const permissions = user.roles?.flatMap(ur => ur.role.permissions) || [];

    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roles,
        permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
  }

  _generateTempToken(userId) {
    return jwt.sign(
      { userId, type: 'mfa_pending' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
  }

  _verifyTempToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  _generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(encryptionService.generateToken(4).toUpperCase());
    }
    return codes;
  }

  _sanitizeUser(user) {
    const { passwordHash, mfaSecret, ...safeUser } = user;
    return {
      ...safeUser,
      roles: user.roles?.map(ur => ur.role.name) || []
    };
  }
}

module.exports = new AuthService();
