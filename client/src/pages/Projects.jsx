import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { projectsApi, teamsApi } from '../services/api';
import { Plus, FolderKanban, X, Loader2, Github, Brain } from 'lucide-react';

export default function Projects() {
  const location = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', filter],
    queryFn: () => projectsApi.getAll(filter !== 'all' ? { status: filter } : {})
  });

  const projects = data?.data?.data?.projects || [];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE': return 'badge-success';
      case 'COMPLETED': return 'badge-info';
      case 'ON_HOLD': return 'badge-warning';
      case 'CANCELLED': return 'badge-danger';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <p className="text-slate-600">Manage and track your team projects</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          New Project
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'ACTIVE', 'COMPLETED', 'ON_HOLD'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FolderKanban size={20} className="text-green-600" />
                </div>
                <span className={`badge ${getStatusBadge(project.status)}`}>
                  {project.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-800">{project.name}</h3>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                {project.description || 'No description'}
              </p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-600">{project.team?.name}</span>
                <div className="flex items-center gap-2">
                  {project.githubRepos?.length > 0 && (
                    <Github size={14} className="text-slate-400" />
                  )}
                  {project.aiAnalyses?.length > 0 && (
                    <Brain size={14} className="text-purple-400" />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <FolderKanban size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No projects yet</h3>
          <p className="text-slate-500 mb-4">Create your first project to get started</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Project
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          initialTeamId={location.state?.teamId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ initialTeamId, onClose }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { teamId: initialTeamId || '' }
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.getAll()
  });

  const teams = teamsData?.data?.data?.teams || [];

  const createMutation = useMutation({
    mutationFn: (data) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Create Project</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="p-6 space-y-4">
          {createMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {createMutation.error.response?.data?.error || 'Failed to create project'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Team
            </label>
            <select
              className="input"
              {...register('teamId', { required: 'Team is required' })}
            >
              <option value="">Select a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            {errors.teamId && (
              <p className="mt-1 text-sm text-red-600">{errors.teamId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              className="input"
              placeholder="Customer Portal"
              {...register('name', { required: 'Project name is required' })}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder="What is this project about?"
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="input"
                {...register('startDate')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                className="input"
                {...register('endDate')}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {createMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
