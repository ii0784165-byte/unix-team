import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { projectsApi, aiApi, githubApi } from '../services/api';
import {
  ArrowLeft, FolderKanban, Settings, Github, Brain, Loader2,
  X, ExternalLink, Users, TrendingUp, AlertCircle
} from 'lucide-react';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [showLinkGithub, setShowLinkGithub] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(projectId)
  });

  const { data: analysisData } = useQuery({
    queryKey: ['project-analysis', projectId],
    queryFn: () => aiApi.analyzeProject(projectId),
    enabled: !!data
  });

  const { data: hrSuggestions } = useQuery({
    queryKey: ['hr-suggestions', projectId],
    queryFn: () => aiApi.getHrSuggestions(projectId),
    enabled: !!data
  });

  const requestAnalysisMutation = useMutation({
    mutationFn: () => projectsApi.requestAnalysis(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries(['project-analysis', projectId]);
      queryClient.invalidateQueries(['hr-suggestions', projectId]);
    }
  });

  const project = data?.data?.data?.project;
  const analysis = analysisData?.data?.data?.analysis;
  const suggestions = hrSuggestions?.data?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-700">Project not found</h2>
        <button onClick={() => navigate('/projects')} className="btn btn-primary mt-4">
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/projects')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft size={18} />
        Back to Projects
      </button>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <FolderKanban size={24} className="text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
              <p className="text-slate-500">{project.team?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${
              project.status === 'ACTIVE' ? 'badge-success' :
              project.status === 'COMPLETED' ? 'badge-info' : 'badge-warning'
            }`}>
              {project.status}
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="btn btn-secondary"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {project.description && (
          <p className="mt-4 text-slate-600">{project.description}</p>
        )}

        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
          {project.startDate && (
            <div className="text-sm">
              <span className="text-slate-500">Start:</span>{' '}
              <span className="text-slate-700">
                {new Date(project.startDate).toLocaleDateString()}
              </span>
            </div>
          )}
          {project.endDate && (
            <div className="text-sm">
              <span className="text-slate-500">End:</span>{' '}
              <span className="text-slate-700">
                {new Date(project.endDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GitHub Repos */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Github size={20} />
              GitHub Repositories
            </h2>
            <button
              onClick={() => setShowLinkGithub(true)}
              className="btn btn-secondary btn-sm"
            >
              Link Repo
            </button>
          </div>

          {project.githubRepos?.length > 0 ? (
            <div className="space-y-3">
              {project.githubRepos.map((repo) => (
                <a
                  key={repo.id}
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-700">{repo.fullName}</p>
                      <p className="text-sm text-slate-500">{repo.description}</p>
                    </div>
                    <ExternalLink size={16} className="text-slate-400" />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>{repo.language}</span>
                    <span>{repo.stars} stars</span>
                    <span>{repo.forks} forks</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-6">No repositories linked</p>
          )}
        </div>

        {/* AI Analysis */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Brain size={20} className="text-purple-600" />
              AI Analysis
            </h2>
            <button
              onClick={() => requestAnalysisMutation.mutate()}
              disabled={requestAnalysisMutation.isPending}
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              {requestAnalysisMutation.isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Analyze
            </button>
          </div>

          {analysis ? (
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-800 mb-1">Summary</h3>
                <p className="text-sm text-purple-700">{analysis.summary}</p>
              </div>

              {analysis.usefulness && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <h3 className="font-medium text-green-800 mb-1 flex items-center gap-2">
                    <TrendingUp size={16} />
                    Why It's Useful
                  </h3>
                  <p className="text-sm text-green-700">{analysis.usefulness}</p>
                </div>
              )}

              {analysis.beneficiaries && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <h3 className="font-medium text-blue-800 mb-1 flex items-center gap-2">
                    <Users size={16} />
                    Who Benefits
                  </h3>
                  <p className="text-sm text-blue-700">{analysis.beneficiaries}</p>
                </div>
              )}

              {analysis.risks && (
                <div className="p-3 bg-orange-50 rounded-lg">
                  <h3 className="font-medium text-orange-800 mb-1 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Potential Risks
                  </h3>
                  <p className="text-sm text-orange-700">{analysis.risks}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <Brain size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500">Click "Analyze" to get AI insights</p>
            </div>
          )}
        </div>
      </div>

      {/* HR Suggestions */}
      {suggestions && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            HR Suggestions for This Project
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.skillsNeeded && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-700 mb-2">Skills Needed</h3>
                <div className="flex flex-wrap gap-2">
                  {suggestions.skillsNeeded.map((skill, i) => (
                    <span key={i} className="badge badge-info">{skill}</span>
                  ))}
                </div>
              </div>
            )}
            {suggestions.teamSize && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-700 mb-2">Recommended Team Size</h3>
                <p className="text-slate-600">{suggestions.teamSize}</p>
              </div>
            )}
            {suggestions.timeline && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-700 mb-2">Estimated Timeline</h3>
                <p className="text-slate-600">{suggestions.timeline}</p>
              </div>
            )}
            {suggestions.budget && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-700 mb-2">Budget Consideration</h3>
                <p className="text-slate-600">{suggestions.budget}</p>
              </div>
            )}
          </div>
          {suggestions.recommendations && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-2">Recommendations</h3>
              <p className="text-sm text-blue-700">{suggestions.recommendations}</p>
            </div>
          )}
        </div>
      )}

      {showLinkGithub && (
        <LinkGithubModal projectId={projectId} onClose={() => setShowLinkGithub(false)} />
      )}

      {showSettings && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function LinkGithubModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const linkMutation = useMutation({
    mutationFn: (data) => projectsApi.linkGithub(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['project', projectId]);
      onClose();
    }
  });

  const searchRepos = async (query) => {
    if (!query || query.length < 2) return;
    setSearching(true);
    try {
      const response = await githubApi.searchRepos(query);
      setSearchResults(response.data.data?.repos || []);
    } catch (error) {
      console.error('Search failed:', error);
    }
    setSearching(false);
  };

  const selectRepo = (repo) => {
    linkMutation.mutate({
      repoFullName: repo.full_name,
      repoUrl: repo.html_url
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Link GitHub Repository</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <input
            type="text"
            className="input"
            placeholder="Search repositories..."
            onChange={(e) => searchRepos(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {searching ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-primary-600" size={24} />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => selectRepo(repo)}
                  disabled={linkMutation.isPending}
                  className="w-full text-left p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <p className="font-medium text-slate-700">{repo.full_name}</p>
                  <p className="text-sm text-slate-500 line-clamp-1">{repo.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-4">
              Search for a repository to link
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsModal({ project, onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: project.name,
      description: project.description,
      status: project.status
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => projectsApi.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['project', project.id]);
      queryClient.invalidateQueries(['projects']);
      onClose();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      navigate('/projects');
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Project Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <input type="text" className="input" {...register('name')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea className="input" rows={3} {...register('description')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <select className="input" {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="btn btn-primary flex-1"
            >
              Save Changes
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to delete this project?')) {
                  deleteMutation.mutate();
                }
              }}
              className="btn btn-danger w-full"
            >
              Delete Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
