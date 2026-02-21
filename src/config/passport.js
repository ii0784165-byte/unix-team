/**
 * Passport Configuration
 * OAuth strategies for Google and GitHub
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('../services/encryption.service');
const { logger } = require('./logger');

const prisma = new PrismaClient();

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true
      }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// ============================================
// GOOGLE OAUTH STRATEGY
// ============================================
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      
      if (!email) {
        return done(new Error('No email provided by Google'), null);
      }

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Create new user from Google profile
        user = await prisma.user.create({
          data: {
            email,
            firstName: profile.name?.givenName || profile.displayName || 'User',
            lastName: profile.name?.familyName || '',
            avatar: profile.photos?.[0]?.value,
            isVerified: true // Google accounts are pre-verified
          }
        });

        // Assign default role
        const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });
        if (memberRole) {
          await prisma.userRole.create({
            data: { userId: user.id, roleId: memberRole.id }
          });
        }

        logger.info(`New user created via Google OAuth: ${email}`);
      }

      // Store/update OAuth connection
      const encryptedAccessToken = encryptionService.encrypt(accessToken);
      const encryptedRefreshToken = refreshToken ? encryptionService.encrypt(refreshToken) : null;

      await prisma.oAuthConnection.upsert({
        where: {
          provider_providerId: {
            provider: 'google',
            providerId: profile.id
          }
        },
        create: {
          userId: user.id,
          provider: 'google',
          providerId: profile.id,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          scope: ['profile', 'email', 'drive.readonly']
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken
        }
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      return done(null, user);
    } catch (error) {
      logger.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));
}

// ============================================
// GITHUB OAUTH STRATEGY
// ============================================
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email', 'read:user', 'repo']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Get primary email
      const email = profile.emails?.find(e => e.primary)?.value ||
                   profile.emails?.[0]?.value ||
                   `${profile.username}@github.local`;

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Create new user from GitHub profile
        user = await prisma.user.create({
          data: {
            email,
            firstName: profile.displayName?.split(' ')[0] || profile.username,
            lastName: profile.displayName?.split(' ').slice(1).join(' ') || '',
            avatar: profile.photos?.[0]?.value,
            isVerified: true
          }
        });

        // Assign default role
        const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });
        if (memberRole) {
          await prisma.userRole.create({
            data: { userId: user.id, roleId: memberRole.id }
          });
        }

        logger.info(`New user created via GitHub OAuth: ${email}`);
      }

      // Store/update OAuth connection
      const encryptedAccessToken = encryptionService.encrypt(accessToken);

      await prisma.oAuthConnection.upsert({
        where: {
          provider_providerId: {
            provider: 'github',
            providerId: profile.id.toString()
          }
        },
        create: {
          userId: user.id,
          provider: 'github',
          providerId: profile.id.toString(),
          accessToken: encryptedAccessToken,
          scope: ['user:email', 'read:user', 'repo']
        },
        update: {
          accessToken: encryptedAccessToken
        }
      });

      // Create/update GitHub profile
      await prisma.gitHubProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          username: profile.username,
          profileUrl: profile.profileUrl,
          avatarUrl: profile.photos?.[0]?.value,
          bio: profile._json?.bio,
          company: profile._json?.company,
          location: profile._json?.location,
          publicRepos: profile._json?.public_repos || 0,
          followers: profile._json?.followers || 0,
          following: profile._json?.following || 0
        },
        update: {
          avatarUrl: profile.photos?.[0]?.value,
          bio: profile._json?.bio,
          company: profile._json?.company,
          location: profile._json?.location,
          publicRepos: profile._json?.public_repos || 0,
          followers: profile._json?.followers || 0,
          following: profile._json?.following || 0,
          lastSyncAt: new Date()
        }
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      return done(null, user);
    } catch (error) {
      logger.error('GitHub OAuth error:', error);
      return done(error, null);
    }
  }));
}

module.exports = passport;
