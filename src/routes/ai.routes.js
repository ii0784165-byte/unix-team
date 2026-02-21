/**
 * AI Routes
 * AI-powered analysis and HR suggestions
 */

const express = require('express');
const { body, param } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');
const aiService = require('../services/ai.service');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /ai/analyze/project/:projectId
 * Analyze a project
 */
router.post('/analyze/project/:projectId', authenticate, requirePermission('ai:analyze'), [
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

  const analysis = await aiService.analyzeProject(project, analysisType, req.user.userId);

  await logAction(req, AUDIT_ACTIONS.AI_ANALYSIS_REQUESTED, 'Project', projectId, {
    analysisType
  });

  res.json({
    success: true,
    data: { analysis }
  });
}));

/**
 * POST /ai/analyze/usefulness/:projectId
 * Get project usefulness analysis
 */
router.post('/analyze/usefulness/:projectId', authenticate, requirePermission('ai:analyze'), [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { team: true, githubRepos: true }
  });

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const analysis = await aiService.analyzeProjectUsefulness(project);

  res.json({
    success: true,
    data: { analysis }
  });
}));

/**
 * POST /ai/analyze/beneficiaries/:projectId
 * Identify project beneficiaries
 */
router.post('/analyze/beneficiaries/:projectId', authenticate, requirePermission('ai:analyze'), [
  param('projectId').isUUID()
], asyncHandler(async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { team: true }
  });

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  const analysis = await aiService.identifyBeneficiaries(project);

  res.json({
    success: true,
    data: { analysis }
  });
}));

/**
 * GET /ai/hr/suggestions/:teamId
 * Get HR suggestions for a team
 */
router.get('/hr/suggestions/:teamId', authenticate, requirePermission('hr:suggestions'), [
  param('teamId').isUUID()
], asyncHandler(async (req, res) => {
  const suggestions = await aiService.generateHRSuggestions(req.params.teamId);

  await logAction(req, AUDIT_ACTIONS.AI_SUGGESTION_VIEWED, 'Team', req.params.teamId, {
    type: 'hr_suggestions'
  });

  res.json({
    success: true,
    data: { suggestions }
  });
}));

/**
 * GET /ai/hr/report/:teamId
 * Generate comprehensive team report for HR
 */
router.get('/hr/report/:teamId', authenticate, requirePermission('hr:reports'), [
  param('teamId').isUUID()
], asyncHandler(async (req, res) => {
  const report = await aiService.generateTeamReport(req.params.teamId);

  await logAction(req, AUDIT_ACTIONS.AI_SUGGESTION_VIEWED, 'Team', req.params.teamId, {
    type: 'team_report'
  });

  res.json({
    success: true,
    data: { report }
  });
}));

/**
 * POST /ai/analyze/github/:userId
 * Analyze user's GitHub profile for skills
 */
router.post('/analyze/github/:userId', authenticate, requirePermission('ai:analyze'), [
  param('userId').isUUID()
], asyncHandler(async (req, res) => {
  const profile = await prisma.gitHubProfile.findUnique({
    where: { userId: req.params.userId }
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: 'GitHub profile not found' });
  }

  const analysis = await aiService.analyzeGitHubProfile(profile);

  res.json({
    success: true,
    data: { analysis }
  });
}));

/**
 * GET /ai/analyses
 * Get all analyses (admin/HR)
 */
router.get('/analyses', authenticate, requirePermission('hr:view_all'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, projectId, analysisType } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (projectId) where.projectId = projectId;
  if (analysisType) where.analysisType = analysisType;

  const [analyses, total] = await Promise.all([
    prisma.projectAIAnalysis.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, team: { select: { name: true } } }
        }
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.projectAIAnalysis.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      analyses,
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
 * GET /ai/dashboard
 * AI insights dashboard for HR
 */
router.get('/dashboard', authenticate, requirePermission('hr:view_all'), asyncHandler(async (req, res) => {
  const [
    totalProjects,
    analyzedProjects,
    recentAnalyses,
    topUsefulProjects,
    skillStats
  ] = await Promise.all([
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.projectAIAnalysis.groupBy({
      by: ['projectId'],
      _count: { projectId: true }
    }),
    prisma.projectAIAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        project: { select: { name: true, team: { select: { name: true } } } }
      }
    }),
    prisma.projectAIAnalysis.findMany({
      where: { usefulnessScore: { not: null } },
      orderBy: { usefulnessScore: 'desc' },
      take: 10,
      include: {
        project: { select: { id: true, name: true } }
      }
    }),
    prisma.projectAIAnalysis.findMany({
      select: { requiredSkills: true }
    })
  ]);

  // Calculate skill demand
  const skillCounts = {};
  skillStats.forEach(s => {
    s.requiredSkills?.forEach(skill => {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    });
  });

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, demand: count }));

  res.json({
    success: true,
    data: {
      overview: {
        totalProjects,
        analyzedProjects: analyzedProjects.length,
        analysisCoverage: Math.round((analyzedProjects.length / totalProjects) * 100)
      },
      recentAnalyses,
      topUsefulProjects: topUsefulProjects.map(a => ({
        projectId: a.project.id,
        projectName: a.project.name,
        usefulnessScore: a.usefulnessScore
      })),
      topSkillsInDemand: topSkills
    }
  });
}));

module.exports = router;
