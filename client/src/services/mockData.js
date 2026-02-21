// Mock data for development without backend
// Data persists in localStorage

const STORAGE_KEYS = {
  USER: 'unix_team_user',
  TEAMS: 'unix_team_teams',
  PROJECTS: 'unix_team_projects',
  DOCUMENTS: 'unix_team_documents',
  GITHUB_PROFILE: 'unix_team_github'
};

// Initialize with sample data if empty
function initializeMockData() {
  if (!localStorage.getItem(STORAGE_KEYS.USER)) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({
      id: '1',
      email: 'admin@unixteam.com',
      firstName: 'Admin',
      lastName: 'User',
      role: { name: 'admin', permissions: ['*'] },
      mfaEnabled: false,
      department: 'Engineering',
      position: 'Team Lead',
      createdAt: new Date().toISOString()
    }));
  }

  if (!localStorage.getItem(STORAGE_KEYS.TEAMS)) {
    localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify([
      {
        id: '1',
        name: 'Engineering Team',
        description: 'Core product development team',
        ownerId: '1',
        members: [
          { id: '1', userId: '1', role: 'OWNER', user: { id: '1', firstName: 'Admin', lastName: 'User', email: 'admin@unixteam.com' } }
        ],
        _count: { members: 1, projects: 2 },
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Design Team',
        description: 'UI/UX and product design',
        ownerId: '1',
        members: [
          { id: '2', userId: '1', role: 'OWNER', user: { id: '1', firstName: 'Admin', lastName: 'User', email: 'admin@unixteam.com' } }
        ],
        _count: { members: 1, projects: 1 },
        createdAt: new Date().toISOString()
      }
    ]));
  }

  if (!localStorage.getItem(STORAGE_KEYS.PROJECTS)) {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify([
      {
        id: '1',
        name: 'Customer Portal',
        description: 'Self-service customer management portal',
        teamId: '1',
        team: { id: '1', name: 'Engineering Team' },
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        githubRepos: [],
        aiAnalyses: [],
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Mobile App',
        description: 'Cross-platform mobile application',
        teamId: '1',
        team: { id: '1', name: 'Engineering Team' },
        status: 'ACTIVE',
        startDate: '2026-02-01',
        endDate: '2026-08-31',
        githubRepos: [],
        aiAnalyses: [],
        createdAt: new Date().toISOString()
      },
      {
        id: '3',
        name: 'Brand Redesign',
        description: 'Company brand and visual identity update',
        teamId: '2',
        team: { id: '2', name: 'Design Team' },
        status: 'COMPLETED',
        startDate: '2025-10-01',
        endDate: '2026-01-15',
        githubRepos: [],
        aiAnalyses: [],
        createdAt: new Date().toISOString()
      }
    ]));
  }

  if (!localStorage.getItem(STORAGE_KEYS.DOCUMENTS)) {
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify([]));
  }
}

// Helper to generate unique IDs
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generic CRUD helpers
function getAll(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function getById(key, id) {
  const items = getAll(key);
  return items.find(item => item.id === id);
}

function create(key, data) {
  const items = getAll(key);
  const newItem = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  items.push(newItem);
  localStorage.setItem(key, JSON.stringify(items));
  return newItem;
}

function update(key, id, data) {
  const items = getAll(key);
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) {
    items[index] = { ...items[index], ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(items));
    return items[index];
  }
  return null;
}

function remove(key, id) {
  const items = getAll(key);
  const filtered = items.filter(item => item.id !== id);
  localStorage.setItem(key, JSON.stringify(filtered));
  return true;
}

// Initialize data on load
initializeMockData();

export { STORAGE_KEYS, getAll, getById, create, update, remove, generateId, initializeMockData };
