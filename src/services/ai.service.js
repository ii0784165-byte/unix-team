/**
 * AI Service
 * OpenAI-powered analysis for HR suggestions and project evaluation
 */

const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class AIService {
  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    this.maxTokens = 2000;
    this.analysisValidityDays = 30;
  }

  /**
   * Analyze a project for HR suggestions
   */
  async analyzeProject(project, analysisType, analyzedBy) {
    try {
      const prompt = this._buildProjectPrompt(project, analysisType);
      
      const completion = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert HR and business analyst. Analyze projects and provide actionable insights for HR teams about project value, team composition, and organizational impact. Be specific and data-driven in your analysis.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const response = JSON.parse(completion.choices[0].message.content);
      
      // Store analysis in database
      const analysis = await prisma.projectAIAnalysis.create({
        data: {
          projectId: project.id,
          analysisType,
          summary: response.summary,
          usefulnessScore: response.usefulnessScore,
          targetBeneficiaries: response.beneficiaries || [],
          businessImpact: response.businessImpact,
          requiredSkills: response.requiredSkills || [],
          estimatedROI: response.estimatedROI,
          recommendations: response.recommendations || [],
          riskAssessment: response.risks,
          aiModel: this.model,
          confidence: response.confidence || 0.85,
          analyzedBy,
          expiresAt: new Date(Date.now() + this.analysisValidityDays * 24 * 60 * 60 * 1000)
        }
      });

      logger.info(`AI analysis completed for project ${project.id}`, {
        analysisType,
        confidence: response.confidence
      });

      return analysis;
    } catch (error) {
      logger.error('AI analysis failed:', error);
      throw new Error('Failed to analyze project: ' + error.message);
    }
  }

  /**
   * Generate HR suggestions for a team
   */
  async generateHRSuggestions(teamId) {
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          members: {
            where: { leftAt: null },
            include: {
              user: {
                include: {
                  githubProfile: true
                }
              }
            }
          },
          projects: {
            where: { deletedAt: null },
            include: {
              githubRepos: true,
              aiAnalyses: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!team) {
        throw new Error('Team not found');
      }

      const prompt = this._buildTeamHRPrompt(team);

      const completion = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert HR consultant specializing in tech teams. Analyze team composition, skills, and projects to provide actionable suggestions for team development, hiring, and organizational improvement. Format your response as JSON.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const suggestions = JSON.parse(completion.choices[0].message.content);

      logger.info(`HR suggestions generated for team ${teamId}`);

      return suggestions;
    } catch (error) {
      logger.error('HR suggestion generation failed:', error);
      throw new Error('Failed to generate HR suggestions: ' + error.message);
    }
  }

  /**
   * Analyze project usefulness for the company
   */
  async analyzeProjectUsefulness(project) {
    const prompt = `
Analyze the following project and determine its usefulness for the company:

Project Name: ${project.name}
Description: ${project.description || 'No description provided'}
Technologies: ${project.technologies?.join(', ') || 'Not specified'}
Status: ${project.status}
Team: ${project.team?.name || 'Unknown'}
GitHub Repositories: ${project.githubRepos?.map(r => `${r.repoOwner}/${r.repoName}`).join(', ') || 'None linked'}

Provide a JSON response with:
{
  "summary": "Brief summary of project's value proposition",
  "usefulnessScore": 1-100,
  "beneficiaries": ["List of departments/roles that benefit"],
  "businessImpact": "Description of potential business impact",
  "recommendations": ["List of actionable recommendations"],
  "risks": "Potential risks or challenges",
  "estimatedROI": "Estimated return on investment description",
  "requiredSkills": ["Skills needed for project success"],
  "confidence": 0.0-1.0
}
`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a business analyst evaluating technology projects for organizational value.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: this.maxTokens,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * Identify beneficiaries of a project
   */
  async identifyBeneficiaries(project) {
    const prompt = `
Analyze who would benefit from the following project:

Project Name: ${project.name}
Description: ${project.description || 'No description'}
Technologies: ${project.technologies?.join(', ') || 'Not specified'}

Identify internal and external beneficiaries. Return JSON:
{
  "internalBeneficiaries": [
    {
      "department": "Department name",
      "role": "Specific role",
      "benefitDescription": "How they benefit",
      "impactLevel": "HIGH/MEDIUM/LOW"
    }
  ],
  "externalBeneficiaries": [
    {
      "type": "Customer/Partner/Public",
      "description": "Who they are",
      "benefitDescription": "How they benefit",
      "impactLevel": "HIGH/MEDIUM/LOW"
    }
  ],
  "organizationalBenefits": ["List of org-wide benefits"],
  "summary": "Brief summary"
}
`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are analyzing project stakeholders and beneficiaries for HR planning.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: this.maxTokens,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * Analyze GitHub profile for skills
   */
  async analyzeGitHubProfile(profile, repos = []) {
    const prompt = `
Analyze this developer's GitHub profile:

Username: ${profile.username}
Bio: ${profile.bio || 'No bio'}
Public Repos: ${profile.publicRepos}
Followers: ${profile.followers}
Top Languages: ${profile.topLanguages?.join(', ') || 'Unknown'}
Contributions: ${profile.contributions || 'Unknown'}

Recent Repositories:
${repos.map(r => `- ${r.name}: ${r.language || 'Unknown'} (${r.stars || 0} stars)`).join('\n')}

Provide a JSON analysis:
{
  "skillLevel": "Junior/Mid/Senior/Lead",
  "primarySkills": ["skill1", "skill2"],
  "secondarySkills": ["skill1", "skill2"],
  "expertiseAreas": ["area1", "area2"],
  "suggestedRoles": ["role1", "role2"],
  "developmentAreas": ["area for improvement"],
  "teamFit": "Description of ideal team/project fit"
}
`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert technical recruiter analyzing developer profiles.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * Generate comprehensive team report
   */
  async generateTeamReport(teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              include: { githubProfile: true }
            }
          }
        },
        projects: {
          where: { deletedAt: null },
          include: {
            aiAnalyses: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (!team) {
      throw new Error('Team not found');
    }

    const teamData = {
      name: team.name,
      description: team.description,
      department: team.department,
      memberCount: team.members.length,
      members: team.members.map(m => ({
        name: `${m.user.firstName} ${m.user.lastName}`,
        role: m.role,
        githubUsername: m.user.githubProfile?.username,
        skills: m.user.githubProfile?.topLanguages || []
      })),
      projects: team.projects.map(p => ({
        name: p.name,
        status: p.status,
        technologies: p.technologies,
        latestAnalysis: p.aiAnalyses[0]?.summary
      }))
    };

    const prompt = `
Generate a comprehensive HR report for this team:

${JSON.stringify(teamData, null, 2)}

Provide a JSON report:
{
  "executiveSummary": "Brief team overview",
  "strengths": ["team strengths"],
  "weaknesses": ["areas for improvement"],
  "skillsMatrix": {
    "covered": ["skills the team has"],
    "missing": ["skills the team needs"]
  },
  "hiringRecommendations": [
    {
      "role": "Role to hire",
      "priority": "HIGH/MEDIUM/LOW",
      "justification": "Why this hire is needed"
    }
  ],
  "projectAlignment": "How well projects align with team skills",
  "developmentPlan": ["training/development recommendations"],
  "riskAssessment": "Team-related risks",
  "overallHealthScore": 1-100
}
`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an HR analytics expert generating team assessment reports.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  // Private helper methods

  _buildProjectPrompt(project, analysisType) {
    const baseInfo = `
Project Information:
- Name: ${project.name}
- Description: ${project.description || 'No description'}
- Status: ${project.status}
- Technologies: ${project.technologies?.join(', ') || 'Not specified'}
- Team: ${project.team?.name || 'Unknown'}
- Department: ${project.team?.department || 'Unknown'}
- GitHub Repos: ${project.githubRepos?.map(r => `${r.repoOwner}/${r.repoName}`).join(', ') || 'None'}
`;

    const analysisPrompts = {
      usefulness: `${baseInfo}
Analyze the project's usefulness and value proposition for the company.
Return JSON with: summary, usefulnessScore (1-100), businessImpact, recommendations, confidence.`,

      beneficiaries: `${baseInfo}
Identify who would benefit from this project.
Return JSON with: summary, beneficiaries (array), businessImpact, recommendations, confidence.`,

      risk: `${baseInfo}
Assess risks associated with this project.
Return JSON with: summary, risks (detailed), recommendations, riskLevel, confidence.`,

      skills: `${baseInfo}
Identify skills required for project success.
Return JSON with: summary, requiredSkills (array), recommendations, confidence.`,

      comprehensive: `${baseInfo}
Provide a comprehensive analysis covering usefulness, beneficiaries, risks, and required skills.
Return JSON with all fields: summary, usefulnessScore, beneficiaries, businessImpact, requiredSkills, recommendations, risks, estimatedROI, confidence.`
    };

    return analysisPrompts[analysisType] || analysisPrompts.comprehensive;
  }

  _buildTeamHRPrompt(team) {
    return `
Analyze this team and provide HR suggestions:

Team: ${team.name}
Department: ${team.department || 'Not specified'}
Description: ${team.description || 'No description'}

Team Members (${team.members.length}):
${team.members.map(m => `
- ${m.user.firstName} ${m.user.lastName} (${m.role})
  GitHub: ${m.user.githubProfile?.username || 'Not linked'}
  Skills: ${m.user.githubProfile?.topLanguages?.join(', ') || 'Unknown'}
`).join('')}

Active Projects (${team.projects.length}):
${team.projects.map(p => `
- ${p.name} (${p.status})
  Technologies: ${p.technologies?.join(', ') || 'Not specified'}
  Latest Analysis: ${p.aiAnalyses[0]?.summary || 'Not analyzed'}
`).join('')}

Provide HR suggestions as JSON:
{
  "summary": "Team overview",
  "strengthAreas": ["list of team strengths"],
  "improvementAreas": ["areas needing improvement"],
  "hiringNeeds": [
    {"role": "Role", "priority": "HIGH/MEDIUM/LOW", "reason": "Why needed"}
  ],
  "trainingRecommendations": ["training suggestions"],
  "teamDynamicsSuggestions": ["team improvement suggestions"],
  "projectAssignmentSuggestions": ["project-member fit suggestions"],
  "retentionRisks": ["retention concerns"],
  "overallAssessment": "Summary assessment"
}
`;
  }
}

module.exports = new AIService();
