# Unix Team - Team Collaboration Platform

A comprehensive enterprise team collaboration platform with Excel/Google Docs integration, GitHub sync, and AI-powered HR suggestions.

## Features

### Core Features
- **Team Management**: Create teams, add members, assign roles
- **Project Tracking**: Manage projects with status tracking and timelines
- **User Profiles**: Complete user management with roles and permissions

### Integrations
- **Excel Integration**: Import/export team and project data via Excel files
- **Google Docs**: Sync documents from Google Drive
- **GitHub**: Connect GitHub profiles, link repositories to projects

### AI-Powered Insights
- **Project Analysis**: AI analyzes projects for business value
- **HR Suggestions**: Get AI recommendations on:
  - Why a project is useful for the company
  - Who will benefit from the project
  - Required skills and team size
  - Timeline and budget considerations

### Security Features
- **RBAC**: Role-based access control with customizable permissions
- **MFA**: Two-factor authentication via authenticator apps
- **OAuth**: Google and GitHub social login
- **Encryption**: AES-256-GCM encryption for sensitive data
- **Audit Logs**: Complete activity tracking
- **Security Incidents**: Automated threat detection

## Tech Stack

### Backend
- **Node.js** + **Express** - API server
- **Prisma** - ORM with PostgreSQL
- **Redis** - Sessions and rate limiting
- **Passport.js** - Authentication (OAuth, JWT)
- **OpenAI API** - AI analysis

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **React Query** - Data fetching
- **Zustand** - State management
- **React Hook Form** - Form handling

## Project Structure

```
unix-team/
├── src/                    # Backend source
│   ├── config/            # Configuration files
│   ├── middleware/        # Express middleware
│   ├── routes/            # API routes
│   └── services/          # Business logic
├── client/                 # React frontend
│   └── src/
│       ├── components/    # React components
│       ├── pages/         # Page components
│       ├── services/      # API service
│       └── store/         # State management
├── prisma/                # Database schema
└── package.json
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- OpenAI API key
- Google OAuth credentials
- GitHub OAuth credentials

### 1. Clone and Install

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/unix_team"
REDIS_URL="redis://localhost:6379"

# Security
JWT_SECRET="your-secure-jwt-secret"
ENCRYPTION_KEY="32-character-encryption-key-here"

# OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# AI
OPENAI_API_KEY="sk-your-openai-api-key"
```

### 3. Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed default roles (optional)
npx prisma db seed
```

### 4. Start Development

```bash
# Start backend (port 5000)
npm run dev

# Start frontend (port 3000)
cd client && npm run dev
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login with email/password |
| POST | /api/auth/mfa/setup | Setup MFA |
| GET | /api/auth/google | Google OAuth |
| GET | /api/auth/github | GitHub OAuth |

### Teams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/teams | List teams |
| POST | /api/teams | Create team |
| GET | /api/teams/:id | Get team details |
| PUT | /api/teams/:id | Update team |
| POST | /api/teams/:id/members | Add member |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| POST | /api/projects/:id/github | Link GitHub repo |
| POST | /api/projects/:id/analyze | Request AI analysis |

### AI Insights
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/ai/projects/:id/analysis | Get project analysis |
| GET | /api/ai/projects/:id/hr-suggestions | Get HR suggestions |
| GET | /api/ai/dashboard | AI insights dashboard |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/documents/excel/upload | Upload Excel file |
| GET | /api/documents/excel/export/team/:id | Export team to Excel |
| POST | /api/documents/google/sync | Sync Google Docs |

## Default Roles

| Role | Description |
|------|-------------|
| admin | Full system access |
| hr_manager | HR features, user management |
| team_lead | Team and project management |
| member | Basic team access |
| viewer | Read-only access |

## Security Considerations

- All passwords hashed with bcrypt (12 rounds)
- JWT tokens with 15-minute expiry + refresh tokens
- Rate limiting: 100 requests/15 minutes per IP
- Sensitive data encrypted with AES-256-GCM
- Audit logging for all actions
- Automatic suspicious activity detection

## License

MIT
