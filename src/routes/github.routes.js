/**
 * GitHub Routes
 * GitHub profile and repository management
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');
const githubService = require('../services/github.service');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /github/profile
 * Get current user's GitHub profile
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const profile = await prisma.gitHubProfile.findUnique({
    where: { userId: req.user.userId }
  });

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'GitHub profile not connected'
    });
  }

  res.json({
    success: true,
    data: { profile }
  });
}));

/**
 * POST /github/sync
 * Sync GitHub profile
 */
router.post('/sync', authenticate, asyncHandler(async (req, res) => {
  const result = await githubService.syncUserProfile(req.user.userId);

  await logAction(req, AUDIT_ACTIONS.GITHUB_SYNCED, 'GitHubProfile', req.user.userId);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /github/repos
 * Get user's repositories
 */
router.get('/repos', authenticate, asyncHandler(async (req, res) => {
  const { page, perPage, sort, type } = req.query;

  const repos = await githubService.getUserRepositories(req.user.userId, {
    page: parseInt(page) || 1,
    perPage: parseInt(perPage) || 30,
    sort: sort || 'updated',
    type: type || 'all'
  });

  res.json({
    success: true,
    data: { repos }
  });
}));

/**
 * GET /github/repos/:owner/:repo
 * Get repository details
 */
router.get('/repos/:owner/:repo', authenticate, asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;

  const details = await githubService.getRepositoryDetails(owner, repo, req.user.userId);

  res.json({
    success: true,
    data: details
  });
}));

/**
 * GET /github/repos/:owner/:repo/stats
 * Get repository statistics
 */
router.get('/repos/:owner/:repo/stats', authenticate, asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;

  const stats = await githubService.getRepoStatistics(owner, repo, req.user.userId);

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * GET /github/search
 * Search public repositories
 */
router.get('/search', authenticate, asyncHandler(async (req, res) => {
  const { q, page, perPage, sort, language } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required'
    });
  }

  const results = await githubService.searchRepositories(q, {
    page: parseInt(page) || 1,
    perPage: parseInt(perPage) || 20,
    sort: sort || 'stars',
    language
  });

  res.json({
    success: true,
    data: results
  });
}));

/**
 * DELETE /github/disconnect
 * Disconnect GitHub account
 */
router.delete('/disconnect', authenticate, asyncHandler(async (req, res) => {
  await githubService.disconnectAccount(req.user.userId);

  await logAction(req, AUDIT_ACTIONS.GITHUB_DISCONNECTED, 'GitHubProfile', req.user.userId);

  res.json({
    success: true,
    message: 'GitHub account disconnected'
  });
}));

/**
 * GET /github/users/:userId/profile
 * Get another user's GitHub profile (HR/Admin)
 */
router.get('/users/:userId/profile', authenticate, requirePermission('github:read'), [
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  const profile = await prisma.gitHubProfile.findUnique({
    where: { userId: req.params.userId },
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true }
      }
    }
  });

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'GitHub profile not found'
    });
  }

  res.json({
    success: true,
    data: { profile }
  });
}));

module.exports = router;
