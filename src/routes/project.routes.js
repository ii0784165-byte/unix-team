/**
 * Project Routes
 * Project management and GitHub integration
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission, requireTeamMembership } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');
const aiService = require('../services/ai.service');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================
// PROJECT CRUD OPERATIONS
// ============================================

/**
 * GET /projects
 * List projects with filtering
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    search, 
    status, 
    teamId,
    technology 
  } = req.query;
  
  const skip = (page - 1) * limit;
  const where = { deletedAt: null };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (status) {
    where.status = status;
  }

  if (teamId) {
    where.teamId = teamId;
  }

  if (technology) {
    where.technologies = { has: technology };
  }

  // Non-admins see only their team's projects
  if (!req.user.roles.includes('admin') && !req.user.roles.includes('hr_manager')) {
    const userTeams = await prisma.teamMember.findMany({
      where: { userId: req.user.userId, leftAt: null },
      select: { teamId: true }
    });
    where.teamId = { in: userTeams.map(t => t.teamId) };
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        team: {
          select: { id: true, name: true, avatar: true }
        },
        githubRepos: {
          select: { repoName: true, repoOwner: true, stars: true }
        },
        _count: {
          select: { aiAnalyses: true }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.project.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      projects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

/**
 * GET /projects/:projectId
 * Get project details
 */
router.get('/:projectId', authenticate, [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      team: {
        include: {
          members: {
            where: { leftAt: null },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, avatar: true }
              }
            }
          }
        }
      },
      githubRepos: true,
      aiAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 5
      },
      documents: {
        where: { deletedAt: null },
        select: { id: true, name: true, type: true, sourceType: true }
      }
    }
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  res.json({
    success: true,
    data: { project }
  });
}));

/**
 * POST /projects
 * Create a new project
 */
router.post('/', authenticate, requirePermission('projects:write'), [
  body('teamId').isUUID(),
  body('name').trim().notEmpty().isLength({ max: 150 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  body('technologies').optional().isArray(),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const {
    teamId,
    name,
    description,
    status,
    technologies,
    startDate,
    endDate,
    budget,
    repositoryUrl
  } = req.body;

  // Verify user is member of the team
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: req.user.userId } }
  });

  if (!membership && !req.user.roles.includes('admin')) {
    return res.status(403).json({
      success: false,
      error: 'You must be a team member to create projects'
    });
  }

  const project = await prisma.project.create({
    data: {
      teamId,
      name,
      description,
      status: status || 'PLANNING',
      technologies: technologies || [],
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      budget,
      repositoryUrl
    },
    include: {
      team: { select: { id: true, name: true } }
    }
  });

  await logAction(req, AUDIT_ACTIONS.PROJECT_CREATED, 'Project', project.id, {
    name,
    teamId
  });

  res.status(201).json({
    success: true,
    data: { project }
  });
}));

/**
 * PUT /projects/:projectId
 * Update project
 */
router.put('/:projectId', authenticate, [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  
  // Get project to check team membership
  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true }
  });

  if (!existingProject) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Check permission
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId: existingProject.teamId,
        userId: req.user.userId
      }
    }
  });

  if (!membership && !req.user.roles.includes('admin')) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const {
    name,
    description,
    status,
    technologies,
    startDate,
    endDate,
    budget,
    repositoryUrl,
    isPublic
  } = req.body;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      description,
      status,
      technologies,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      budget,
      repositoryUrl,
      isPublic
    }
  });

  await logAction(req, AUDIT_ACTIONS.PROJECT_UPDATED, 'Project', projectId);

  res.json({
    success: true,
    data: { project }
  });
}));

/**
 * DELETE /projects/:projectId
 * Soft delete project
 */
router.delete('/:projectId', authenticate, requirePermission('projects:delete'), [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const project = await prisma.project.update({
    where: { id: req.params.projectId },
    data: { deletedAt: new Date() }
  });

  await logAction(req, AUDIT_ACTIONS.PROJECT_DELETED, 'Project', project.id);

  res.json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

// ============================================
// GITHUB REPOSITORY LINKING
// ============================================

/**
 * POST /projects/:projectId/github-repos
 * Link GitHub repository to project
 */
router.post('/:projectId/github-repos', authenticate, [
  param('projectId').isUUID(),
  body('repoOwner').trim().notEmpty(),
  body('repoName').trim().notEmpty()
], asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { repoOwner, repoName } = req.body;

  const repoUrl = `https://github.com/${repoOwner}/${repoName}`;

  const linkedRepo = await prisma.projectGitHubRepo.create({
    data: {
      projectId,
      repoOwner,
      repoName,
      repoUrl
    }
  });

  await logAction(req, AUDIT_ACTIONS.GITHUB_CONNECTED, 'Project', projectId, {
    repo: `${repoOwner}/${repoName}`
  });

  res.status(201).json({
    success: true,
    data: { linkedRepo }
  });
}));

/**
 * DELETE /projects/:projectId/github-repos/:repoId
 * Unlink GitHub repository
 */
router.delete('/:projectId/github-repos/:repoId', authenticate, [
  param('projectId').isUUID(),
  param('repoId').isUUID()
], asyncHandler(async (req, res) => {
  await prisma.projectGitHubRepo.delete({
    where: { id: req.params.repoId }
  });

  res.json({
    success: true,
    message: 'Repository unlinked'
  });
}));

// ============================================
// AI ANALYSIS
// ============================================

/**
 * POST /projects/:projectId/analyze
 * Request AI analysis for project
 */
router.post('/:projectId/analyze', authenticate, requirePermission('ai:analyze'), [
  param('projectId').isUUID(),
  body('analysisType').isIn(['usefulness', 'beneficiaries', 'risk', 'skills', 'comprehensive'])
], asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { analysisType } = req.body;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: true,
      githubRepos: true
    }
  });

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Request AI analysis
  const analysis = await aiService.analyzeProject(project, analysisType, req.user.userId);

  await logAction(req, AUDIT_ACTIONS.PROJECT_ANALYZED, 'Project', projectId, {
    analysisType
  });

  res.json({
    success: true,
    data: { analysis }
  });
}));

/**
 * GET /projects/:projectId/analyses
 * Get AI analyses for project
 */
router.get('/:projectId/analyses', authenticate, [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const analyses = await prisma.projectAIAnalysis.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: { analyses }
  });
}));

module.exports = router;
