import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiApi, projectsApi, teamsApi } from '../services/api';
import { Brain, TrendingUp, Users, AlertCircle, CheckCircle, Loader2, ArrowRight } from 'lucide-react';

export default function AIInsights() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['ai-dashboard'],
    queryFn: () => aiApi.getDashboard()
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-with-analysis'],
    queryFn: () => projectsApi.getAll({ hasAnalysis: true })
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.getAll()
  });

  const dashboard = dashboardData?.data?.data || {};
  const projects = projectsData?.data?.data?.projects || [];
  const teams = teamsData?.data?.data?.teams || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Brain className="text-purple-600" />
          AI Insights
        </h1>
        <p className="text-slate-600">AI-powered analysis and HR suggestions for your projects</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Brain size={24} className="text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dashboard.totalAnalyses || 0}</p>
              <p className="text-sm text-slate-500">Total Analyses</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dashboard.projectsAnalyzed || 0}</p>
              <p className="text-sm text-slate-500">Projects Analyzed</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp size={24} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{dashboard.avgUsefulnessScore || 'N/A'}</p>
              <p className="text-sm text-slate-500">Avg. Usefulness Score</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Insights */}
      {dashboard.recentInsights?.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Insights</h2>
          <div className="space-y-4">
            {dashboard.recentInsights.map((insight, index) => (
              <div key={index} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-slate-800">{insight.projectName}</h3>
                    <p className="text-sm text-slate-600 mt-1">{insight.summary}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(insight.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {insight.usefulness && (
                    <div className="p-2 bg-green-50 rounded">
                      <div className="flex items-center gap-1 text-green-700 text-xs font-medium mb-1">
                        <TrendingUp size={12} />
                        Usefulness
                      </div>
                      <p className="text-xs text-green-600">{insight.usefulness}</p>
                    </div>
                  )}
                  {insight.beneficiaries && (
                    <div className="p-2 bg-blue-50 rounded">
                      <div className="flex items-center gap-1 text-blue-700 text-xs font-medium mb-1">
                        <Users size={12} />
                        Beneficiaries
                      </div>
                      <p className="text-xs text-blue-600">{insight.beneficiaries}</p>
                    </div>
                  )}
                </div>

                <Link
                  to={`/projects/${insight.projectId}`}
                  className="inline-flex items-center gap-1 text-primary-600 text-sm mt-3 hover:text-primary-700"
                >
                  View Project <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Needing Analysis */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Projects Pending Analysis</h2>
        {projects.filter(p => !p.aiAnalyses?.length).length > 0 ? (
          <div className="space-y-2">
            {projects.filter(p => !p.aiAnalyses?.length).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle size={18} className="text-orange-600" />
                  <div>
                    <p className="font-medium text-slate-700">{project.name}</p>
                    <p className="text-sm text-slate-500">{project.team?.name}</p>
                  </div>
                </div>
                <span className="text-sm text-orange-600">Analyze Now</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6">All projects have been analyzed!</p>
        )}
      </div>

      {/* Team Reports */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Team Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamReportCard key={team.id} team={team} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamReportCard({ team }) {
  const { data, isLoading } = useQuery({
    queryKey: ['team-report', team.id],
    queryFn: () => aiApi.getTeamReport(team.id),
    enabled: false // Load on demand
  });

  const report = data?.data?.data?.report;

  return (
    <div className="p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-primary-100 rounded-lg">
          <Users size={16} className="text-primary-600" />
        </div>
        <h3 className="font-medium text-slate-800">{team.name}</h3>
      </div>

      <div className="text-sm text-slate-600">
        <p>{team._count?.members || 0} members</p>
        <p>{team._count?.projects || 0} projects</p>
      </div>

      <Link
        to={`/teams/${team.id}`}
        className="inline-flex items-center gap-1 text-primary-600 text-sm mt-3 hover:text-primary-700"
      >
        View Details <ArrowRight size={14} />
      </Link>
    </div>
  );
}
