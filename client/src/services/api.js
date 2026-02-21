/**
 * Mock API Service - Uses localStorage for data persistence
 * No backend required
 */

import { STORAGE_KEYS, getAll, getById, create, update, remove, generateId, initializeMockData } from './mockData';

// Initialize mock data
initializeMockData();

// Simulate API delay
const delay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

// Mock response wrapper
const mockResponse = (data) => ({ data: { success: true, data } });

// ============================================
// AUTH API
// ============================================
export const authApi = {
  login: async ({ email, password }) => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    if (email && password) {
      localStorage.setItem('accessToken', 'mock-token-' + Date.now());
      localStorage.setItem('refreshToken', 'mock-refresh-' + Date.now());
      return mockResponse({ user, accessToken: 'mock-token', refreshToken: 'mock-refresh' });
    }
    throw { response: { data: { error: 'Invalid credentials' } } };
  },

  register: async (data) => {
    await delay();
    const user = {
      id: generateId(),
      ...data,
      role: { name: 'member', permissions: [] },
      mfaEnabled: false,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem('accessToken', 'mock-token-' + Date.now());
    return mockResponse({ user, accessToken: 'mock-token', refreshToken: 'mock-refresh' });
  },

  logout: async () => {
    await delay(100);
    return mockResponse({});
  },

  getProfile: async () => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    return mockResponse({ user });
  },

  setupMfa: async () => {
    await delay();
    return mockResponse({ 
      qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secret: 'MOCK-MFA-SECRET-KEY'
    });
  },

  verifyMfa: async (token) => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    user.mfaEnabled = true;
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    return mockResponse({ success: true });
  },

  changePassword: async (data) => {
    await delay();
    return mockResponse({ success: true });
  }
};

// ============================================
// USERS API
// ============================================
export const usersApi = {
  getAll: async () => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    return mockResponse({ users: [user], pagination: { total: 1, page: 1, pages: 1 } });
  },

  getById: async (id) => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    return mockResponse({ user });
  },

  update: async (id, data) => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    const updated = { ...user, ...data };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));
    return mockResponse({ user: updated });
  }
};

// ============================================
// TEAMS API
// ============================================
export const teamsApi = {
  getAll: async (params = {}) => {
    await delay();
    const teams = getAll(STORAGE_KEYS.TEAMS);
    return mockResponse({ teams, pagination: { total: teams.length, page: 1, pages: 1 } });
  },

  getById: async (id) => {
    await delay();
    const team = getById(STORAGE_KEYS.TEAMS, id);
    return mockResponse({ team });
  },

  create: async (data) => {
    await delay();
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
    const team = create(STORAGE_KEYS.TEAMS, {
      ...data,
      ownerId: user.id,
      members: [
        { id: generateId(), userId: user.id, role: 'OWNER', user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } }
      ],
      _count: { members: 1, projects: 0 }
    });
    return mockResponse({ team });
  },

  update: async (id, data) => {
    await delay();
    const team = update(STORAGE_KEYS.TEAMS, id, data);
    return mockResponse({ team });
  },

  delete: async (id) => {
    await delay();
    remove(STORAGE_KEYS.TEAMS, id);
    return mockResponse({ success: true });
  },

  addMember: async (teamId, data) => {
    await delay();
    const teams = getAll(STORAGE_KEYS.TEAMS);
    const team = teams.find(t => t.id === teamId);
    if (team) {
      const newMember = {
        id: generateId(),
        userId: generateId(),
        role: data.role || 'MEMBER',
        user: { id: generateId(), firstName: 'New', lastName: 'Member', email: data.email }
      };
      team.members.push(newMember);
      team._count.members++;
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
      return mockResponse({ member: newMember });
    }
    throw { response: { data: { error: 'Team not found' } } };
  },

  removeMember: async (teamId, userId) => {
    await delay();
    const teams = getAll(STORAGE_KEYS.TEAMS);
    const team = teams.find(t => t.id === teamId);
    if (team) {
      team.members = team.members.filter(m => m.userId !== userId);
      team._count.members = team.members.length;
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
    }
    return mockResponse({ success: true });
  },

  updateMemberRole: async (teamId, userId, role) => {
    await delay();
    return mockResponse({ success: true });
  }
};

// ============================================
// PROJECTS API
// ============================================
export const projectsApi = {
  getAll: async (params = {}) => {
    await delay();
    let projects = getAll(STORAGE_KEYS.PROJECTS);
    if (params.status && params.status !== 'all') {
      projects = projects.filter(p => p.status === params.status);
    }
    if (params.teamId) {
      projects = projects.filter(p => p.teamId === params.teamId);
    }
    return mockResponse({ projects, pagination: { total: projects.length, page: 1, pages: 1 } });
  },

  getById: async (id) => {
    await delay();
    const project = getById(STORAGE_KEYS.PROJECTS, id);
    return mockResponse({ project });
  },

  create: async (data) => {
    await delay();
    const teams = getAll(STORAGE_KEYS.TEAMS);
    const team = teams.find(t => t.id === data.teamId);
    const project = create(STORAGE_KEYS.PROJECTS, {
      ...data,
      team: team ? { id: team.id, name: team.name } : null,
      status: 'ACTIVE',
      githubRepos: [],
      aiAnalyses: []
    });
    // Update team project count
    if (team) {
      team._count.projects++;
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
    }
    return mockResponse({ project });
  },

  update: async (id, data) => {
    await delay();
    const project = update(STORAGE_KEYS.PROJECTS, id, data);
    return mockResponse({ project });
  },

  delete: async (id) => {
    await delay();
    remove(STORAGE_KEYS.PROJECTS, id);
    return mockResponse({ success: true });
  },

  linkGithub: async (id, repoData) => {
    await delay();
    const projects = getAll(STORAGE_KEYS.PROJECTS);
    const project = projects.find(p => p.id === id);
    if (project) {
      project.githubRepos.push({
        id: generateId(),
        fullName: repoData.repoFullName,
        url: repoData.repoUrl,
        description: 'GitHub repository',
        language: 'JavaScript',
        stars: Math.floor(Math.random() * 100),
        forks: Math.floor(Math.random() * 20)
      });
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    }
    return mockResponse({ success: true });
  },

  requestAnalysis: async (id) => {
    await delay(500);
    const projects = getAll(STORAGE_KEYS.PROJECTS);
    const project = projects.find(p => p.id === id);
    if (project) {
      const analysis = {
        id: generateId(),
        summary: `${project.name} is a strategic project that aligns with company goals.`,
        usefulness: 'This project will improve operational efficiency by 30% and reduce manual workload.',
        beneficiaries: 'End users, operations team, and management will benefit from streamlined processes.',
        risks: 'Timeline depends on team availability and third-party integrations.',
        createdAt: new Date().toISOString()
      };
      project.aiAnalyses = [analysis];
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    }
    return mockResponse({ success: true });
  }
};

// ============================================
// GITHUB API
// ============================================
export const githubApi = {
  syncProfile: async () => {
    await delay();
    const profile = {
      id: generateId(),
      username: 'unixteam-dev',
      name: 'Unix Team Developer',
      avatarUrl: 'https://github.com/identicons/unixteam.png',
      profileUrl: 'https://github.com/unixteam-dev',
      bio: 'Building great software',
      publicRepos: 15,
      followers: 42,
      following: 28
    };
    localStorage.setItem(STORAGE_KEYS.GITHUB_PROFILE, JSON.stringify(profile));
    return mockResponse({ profile });
  },

  getProfile: async () => {
    await delay();
    const profile = JSON.parse(localStorage.getItem(STORAGE_KEYS.GITHUB_PROFILE));
    return mockResponse({ profile });
  },

  getRepos: async () => {
    await delay();
    const repos = [
      { id: 1, name: 'project-alpha', full_name: 'unixteam/project-alpha', description: 'Main project repository', language: 'TypeScript', stargazers_count: 45, forks_count: 12, html_url: 'https://github.com/unixteam/project-alpha' },
      { id: 2, name: 'api-gateway', full_name: 'unixteam/api-gateway', description: 'API gateway service', language: 'Go', stargazers_count: 23, forks_count: 5, html_url: 'https://github.com/unixteam/api-gateway' },
      { id: 3, name: 'mobile-app', full_name: 'unixteam/mobile-app', description: 'React Native mobile app', language: 'JavaScript', stargazers_count: 67, forks_count: 18, html_url: 'https://github.com/unixteam/mobile-app' }
    ];
    return mockResponse({ repos });
  },

  searchRepos: async (query) => {
    await delay();
    const repos = [
      { id: 1, full_name: `search/${query}-repo`, description: `Repository matching: ${query}`, html_url: `https://github.com/search/${query}` }
    ];
    return mockResponse({ repos });
  }
};

// ============================================
// DOCUMENTS API
// ============================================
export const documentsApi = {
  getAll: async () => {
    await delay();
    const documents = getAll(STORAGE_KEYS.DOCUMENTS);
    return mockResponse({ documents });
  },

  uploadExcel: async (file) => {
    await delay(500);
    const doc = create(STORAGE_KEYS.DOCUMENTS, {
      name: file.name,
      type: 'excel',
      size: file.size
    });
    return mockResponse({ document: doc });
  },

  exportTeamExcel: async (teamId) => {
    await delay();
    // Return mock blob
    const blob = new Blob(['Mock Excel Data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { data: blob };
  },

  exportProjectExcel: async (projectId) => {
    await delay();
    const blob = new Blob(['Mock Excel Data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { data: blob };
  },

  syncGoogleDocs: async () => {
    await delay();
    return mockResponse({ synced: 0 });
  },

  getGoogleDocs: async () => {
    await delay();
    return mockResponse({ docs: [] });
  }
};

// ============================================
// AI API
// ============================================
export const aiApi = {
  analyzeProject: async (projectId) => {
    await delay();
    const project = getById(STORAGE_KEYS.PROJECTS, projectId);
    const analysis = project?.aiAnalyses?.[0] || null;
    return mockResponse({ analysis });
  },

  getHrSuggestions: async (projectId) => {
    await delay();
    const project = getById(STORAGE_KEYS.PROJECTS, projectId);
    return mockResponse({
      skillsNeeded: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
      teamSize: '3-5 developers recommended',
      timeline: '4-6 months for full implementation',
      budget: 'Medium - standard development costs apply',
      recommendations: `For ${project?.name || 'this project'}, consider hiring a senior developer to lead and 2-3 mid-level developers for implementation.`
    });
  },

  getTeamReport: async (teamId) => {
    await delay();
    const team = getById(STORAGE_KEYS.TEAMS, teamId);
    return mockResponse({
      report: {
        teamName: team?.name,
        productivity: 'High',
        recommendations: 'Team is performing well. Consider knowledge sharing sessions.'
      }
    });
  },

  getDashboard: async () => {
    await delay();
    const projects = getAll(STORAGE_KEYS.PROJECTS);
    const analyzed = projects.filter(p => p.aiAnalyses?.length > 0);
    return mockResponse({
      totalAnalyses: analyzed.length,
      projectsAnalyzed: analyzed.length,
      avgUsefulnessScore: '8.5/10',
      totalRepos: 3,
      recentInsights: analyzed.map(p => ({
        projectId: p.id,
        projectName: p.name,
        summary: p.aiAnalyses[0]?.summary,
        usefulness: p.aiAnalyses[0]?.usefulness,
        beneficiaries: p.aiAnalyses[0]?.beneficiaries,
        createdAt: p.aiAnalyses[0]?.createdAt
      }))
    });
  },

  analyzeGithub: async (profileId) => {
    await delay();
    return mockResponse({
      analysis: 'Active developer with consistent contributions. Strong in JavaScript ecosystem.'
    });
  }
};

// ============================================
// ADMIN API
// ============================================
export const adminApi = {
  getDashboard: async () => {
    await delay();
    const teams = getAll(STORAGE_KEYS.TEAMS);
    const projects = getAll(STORAGE_KEYS.PROJECTS);
    return mockResponse({
      totalUsers: 1,
      totalTeams: teams.length,
      totalProjects: projects.length,
      openIncidents: 0,
      recentActivity: [
        { action: 'USER_LOGIN', createdAt: new Date().toISOString(), user: { email: 'admin@unixteam.com' } }
      ]
    });
  },

  getAuditLogs: async (params = {}) => {
    await delay();
    return mockResponse({
      logs: [
        { id: '1', action: 'USER_LOGIN', resourceType: 'User', ipAddress: '127.0.0.1', createdAt: new Date().toISOString(), user: { email: 'admin@unixteam.com' }, metadata: {} }
      ],
      pagination: { page: 1, pages: 1, total: 1 }
    });
  },

  getSecurityIncidents: async () => {
    await delay();
    return mockResponse({ incidents: [] });
  },

  getRoles: async () => {
    await delay();
    return mockResponse({
      roles: [
        { id: '1', name: 'admin', description: 'Full system access', permissions: [{ id: '1', name: '*' }], _count: { users: 1 } },
        { id: '2', name: 'member', description: 'Standard team member', permissions: [{ id: '2', name: 'read' }], _count: { users: 0 } }
      ]
    });
  },

  createRole: async (data) => {
    await delay();
    return mockResponse({ role: { id: generateId(), ...data } });
  },

  updateRole: async (id, data) => {
    await delay();
    return mockResponse({ role: { id, ...data } });
  },

  assignUserRole: async (userId, roleId) => {
    await delay();
    return mockResponse({ success: true });
  }
};

export default {
  authApi,
  usersApi,
  teamsApi,
  projectsApi,
  githubApi,
  documentsApi,
  aiApi,
  adminApi
};
