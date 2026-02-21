import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { teamsApi, projectsApi, aiApi } from '../services/api';
import { Users, FolderKanban, GitBranch, Brain, ArrowRight, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.getAll({ limit: 5 })
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getAll({ limit: 5 })
  });

  const { data: aiDashboard } = useQuery({
    queryKey: ['ai-dashboard'],
    queryFn: () => aiApi.getDashboard()
  });

  const teams = teamsData?.data?.data?.teams || [];
  const projects = projectsData?.data?.data?.projects || [];
  const insights = aiDashboard?.data?.data || {};

  const stats = [
    { 
      label: 'Teams', 
      value: teamsData?.data?.data?.pagination?.total || 0, 
      icon: Users, 
      color: 'bg-blue-500',
      link: '/teams'
    },
    { 
      label: 'Projects', 
      value: projectsData?.data?.data?.pagination?.total || 0, 
      icon: FolderKanban, 
      color: 'bg-green-500',
      link: '/projects'
    },
    { 
      label: 'GitHub Repos', 
      value: insights.totalRepos || 0, 
      icon: GitBranch, 
      color: 'bg-purple-500',
      link: '/github'
    },
    { 
      label: 'AI Analyses', 
      value: insights.totalAnalyses || 0, 
      icon: Brain, 
      color: 'bg-orange-500',
      link: '/ai-insights'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-slate-600">Here's what's happening with your teams.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            to={stat.link}
            className="card hover:shadow-md transition-shadow flex items-center gap-4"
          >
            <div className={`${stat.color} p-3 rounded-lg text-white`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-sm text-slate-600">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Teams */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Your Teams</h2>
            <Link to="/teams" className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {teams.length > 0 ? (
            <div className="space-y-3">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-800">{team.name}</h3>
                      <p className="text-sm text-slate-500">{team._count?.members || 0} members</p>
                    </div>
                    <span className="badge badge-info">{team._count?.projects || 0} projects</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No teams yet. Create your first team!</p>
          )}
        </div>

        {/* Recent Projects */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent Projects</h2>
            <Link to="/projects" className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-800">{project.name}</h3>
                      <p className="text-sm text-slate-500">{project.team?.name}</p>
                    </div>
                    <span className={`badge ${
                      project.status === 'ACTIVE' ? 'badge-success' :
                      project.status === 'COMPLETED' ? 'badge-info' : 'badge-warning'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No projects yet. Start a new project!</p>
          )}
        </div>
      </div>

      {/* AI Insights Preview */}
      {insights.recentInsights?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Brain size={20} className="text-purple-600" />
              AI Insights
            </h2>
            <Link to="/ai-insights" className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {insights.recentInsights.slice(0, 3).map((insight, index) => (
              <div key={index} className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-start gap-3">
                  <TrendingUp size={18} className="text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-700">{insight.summary}</p>
                    <p className="text-xs text-slate-500 mt-1">{insight.projectName}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
