/**
 * GitHub Integration Service
 * Handles GitHub profile and repository synchronization
 */

const { Octokit } = require('octokit');
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('./encryption.service');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

class GitHubService {
  constructor() {
    this.perPage = 30;
  }

  /**
   * Get authenticated Octokit client for user
   */
  async _getOctokit(userId) {
    const connection = await prisma.oAuthConnection.findFirst({
      where: { userId, provider: 'github' }
    });

    if (!connection) {
      throw new Error('GitHub account not connected');
    }

    const accessToken = encryptionService.decrypt(connection.accessToken);
    
    return new Octokit({ auth: accessToken });
  }

  /**
   * Get public Octokit client (for public repos)
   */
  _getPublicOctokit() {
    return new Octokit();
  }

  /**
   * Fetch and sync user's GitHub profile
   */
  async syncUserProfile(userId) {
    try {
      const octokit = await this._getOctokit(userId);
      
      // Get authenticated user's profile
      const { data: profile } = await octokit.rest.users.getAuthenticated();
      
      // Get user's repositories
      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });

      // Calculate contributions (events from last year)
      const { data: events } = await octokit.rest.activity.listEventsForAuthenticatedUser({
        username: profile.login,
        per_page: 100
      });

      const contributions = events.filter(e => 
        ['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'CreateEvent'].includes(e.type)
      ).length;

      // Calculate top languages
      const languageCounts = {};
      repos.forEach(repo => {
        if (repo.language) {
          languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
        }
      });

      const topLanguages = Object.entries(languageCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);

      // Update or create GitHub profile
      const githubProfile = await prisma.gitHubProfile.upsert({
        where: { userId },
        create: {
          userId,
          username: profile.login,
          profileUrl: profile.html_url,
          avatarUrl: profile.avatar_url,
          bio: profile.bio,
          company: profile.company,
          location: profile.location,
          publicRepos: profile.public_repos,
          followers: profile.followers,
          following: profile.following,
          contributions,
          topLanguages,
          lastSyncAt: new Date()
        },
        update: {
          avatarUrl: profile.avatar_url,
          bio: profile.bio,
          company: profile.company,
          location: profile.location,
          publicRepos: profile.public_repos,
          followers: profile.followers,
          following: profile.following,
          contributions,
          topLanguages,
          lastSyncAt: new Date()
        }
      });

      logger.info(`Synced GitHub profile for user ${userId}: ${profile.login}`);

      return {
        profile: githubProfile,
        repoCount: repos.length
      };
    } catch (error) {
      logger.error('Failed to sync GitHub profile:', error);
      throw new Error('GitHub sync failed: ' + error.message);
    }
  }

  /**
   * Get user's repositories
   */
  async getUserRepositories(userId, options = {}) {
    try {
      const octokit = await this._getOctokit(userId);
      const { page = 1, perPage = 30, sort = 'updated', type = 'all' } = options;

      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        sort,
        type,
        per_page: perPage,
        page
      });

      return repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.watchers_count,
        isPrivate: repo.private,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        topics: repo.topics || []
      }));
    } catch (error) {
      logger.error('Failed to get GitHub repos:', error);
      throw new Error('Failed to fetch repositories: ' + error.message);
    }
  }

  /**
   * Get repository details
   */
  async getRepositoryDetails(owner, repo, userId = null) {
    try {
      const octokit = userId 
        ? await this._getOctokit(userId)
        : this._getPublicOctokit();

      const [repoData, languages, contributors, commits] = await Promise.all([
        octokit.rest.repos.get({ owner, repo }),
        octokit.rest.repos.listLanguages({ owner, repo }),
        octokit.rest.repos.listContributors({ owner, repo, per_page: 10 }),
        octokit.rest.repos.listCommits({ owner, repo, per_page: 10 })
      ]);

      return {
        repository: {
          id: repoData.data.id,
          name: repoData.data.name,
          fullName: repoData.data.full_name,
          description: repoData.data.description,
          url: repoData.data.html_url,
          homepage: repoData.data.homepage,
          language: repoData.data.language,
          stars: repoData.data.stargazers_count,
          forks: repoData.data.forks_count,
          watchers: repoData.data.watchers_count,
          openIssues: repoData.data.open_issues_count,
          isPrivate: repoData.data.private,
          createdAt: repoData.data.created_at,
          updatedAt: repoData.data.updated_at,
          pushedAt: repoData.data.pushed_at,
          topics: repoData.data.topics || [],
          license: repoData.data.license?.name
        },
        languages: languages.data,
        contributors: contributors.data.map(c => ({
          login: c.login,
          avatarUrl: c.avatar_url,
          contributions: c.contributions
        })),
        recentCommits: commits.data.map(c => ({
          sha: c.sha.substring(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author.name,
          date: c.commit.author.date
        }))
      };
    } catch (error) {
      logger.error('Failed to get repo details:', error);
      throw new Error('Failed to fetch repository details: ' + error.message);
    }
  }

  /**
   * Sync project repositories
   */
  async syncProjectRepositories(projectId, userId = null) {
    try {
      const linkedRepos = await prisma.projectGitHubRepo.findMany({
        where: { projectId }
      });

      const results = [];

      for (const repo of linkedRepos) {
        try {
          const details = await this.getRepositoryDetails(
            repo.repoOwner, 
            repo.repoName, 
            userId
          );

          await prisma.projectGitHubRepo.update({
            where: { id: repo.id },
            data: {
              isPrivate: details.repository.isPrivate,
              stars: details.repository.stars,
              forks: details.repository.forks,
              language: details.repository.language,
              lastSyncAt: new Date()
            }
          });

          results.push({
            repo: `${repo.repoOwner}/${repo.repoName}`,
            status: 'synced',
            details: details.repository
          });
        } catch (error) {
          results.push({
            repo: `${repo.repoOwner}/${repo.repoName}`,
            status: 'failed',
            error: error.message
          });
        }
      }

      logger.info(`Synced ${results.filter(r => r.status === 'synced').length}/${linkedRepos.length} repos for project ${projectId}`);
      return results;
    } catch (error) {
      logger.error('Failed to sync project repos:', error);
      throw new Error('Repository sync failed: ' + error.message);
    }
  }

  /**
   * Search public repositories
   */
  async searchRepositories(query, options = {}) {
    try {
      const octokit = this._getPublicOctokit();
      const { page = 1, perPage = 20, sort = 'stars', language } = options;

      let searchQuery = query;
      if (language) {
        searchQuery += ` language:${language}`;
      }

      const { data } = await octokit.rest.search.repos({
        q: searchQuery,
        sort,
        order: 'desc',
        per_page: perPage,
        page
      });

      return {
        totalCount: data.total_count,
        items: data.items.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          topics: repo.topics || []
        }))
      };
    } catch (error) {
      logger.error('GitHub search failed:', error);
      throw new Error('Search failed: ' + error.message);
    }
  }

  /**
   * Get repository statistics for analysis
   */
  async getRepoStatistics(owner, repo, userId = null) {
    try {
      const octokit = userId 
        ? await this._getOctokit(userId)
        : this._getPublicOctokit();

      const [
        repoData,
        codeFrequency,
        participation,
        punchCard
      ] = await Promise.all([
        octokit.rest.repos.get({ owner, repo }),
        octokit.rest.repos.getCodeFrequencyStats({ owner, repo }).catch(() => ({ data: [] })),
        octokit.rest.repos.getParticipationStats({ owner, repo }).catch(() => ({ data: { all: [], owner: [] } })),
        octokit.rest.repos.getPunchCardStats({ owner, repo }).catch(() => ({ data: [] }))
      ]);

      // Calculate activity score
      const recentActivity = participation.data?.all?.slice(-4).reduce((a, b) => a + b, 0) || 0;
      const totalActivity = participation.data?.all?.reduce((a, b) => a + b, 0) || 1;
      const activityScore = Math.min(100, Math.round((recentActivity / totalActivity) * 100));

      return {
        repository: {
          name: repoData.data.name,
          fullName: repoData.data.full_name,
          language: repoData.data.language,
          size: repoData.data.size,
          stars: repoData.data.stargazers_count,
          forks: repoData.data.forks_count,
          openIssues: repoData.data.open_issues_count
        },
        activity: {
          activityScore,
          weeklyCommits: participation.data?.all || [],
          totalCommits: totalActivity
        },
        codeFrequency: codeFrequency.data || [],
        punchCard: punchCard.data || []
      };
    } catch (error) {
      logger.error('Failed to get repo statistics:', error);
      throw new Error('Failed to fetch statistics: ' + error.message);
    }
  }

  /**
   * Disconnect GitHub account
   */
  async disconnectAccount(userId) {
    await Promise.all([
      prisma.oAuthConnection.deleteMany({
        where: { userId, provider: 'github' }
      }),
      prisma.gitHubProfile.delete({
        where: { userId }
      }).catch(() => {}) // Ignore if not exists
    ]);

    logger.info(`GitHub account disconnected for user ${userId}`);
  }
}

module.exports = new GitHubService();
