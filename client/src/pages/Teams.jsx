import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { teamsApi } from '../services/api';
import { Plus, Users, X, Loader2 } from 'lucide-react';

export default function Teams() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.getAll()
  });

  const teams = data?.data?.data?.teams || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Teams</h1>
          <p className="text-slate-600">Manage your teams and members</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          New Team
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : teams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Link
              key={team.id}
              to={`/teams/${team.id}`}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <Users size={20} className="text-primary-600" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-800">{team.name}</h3>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                {team.description || 'No description'}
              </p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-600">
                  <strong>{team._count?.members || 0}</strong> members
                </span>
                <span className="text-sm text-slate-600">
                  <strong>{team._count?.projects || 0}</strong> projects
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Users size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No teams yet</h3>
          <p className="text-slate-500 mb-4">Create your first team to get started</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Team
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateTeamModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function CreateTeamModal({ onClose }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const createMutation = useMutation({
    mutationFn: (data) => teamsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['teams']);
      onClose();
    }
  });

  const onSubmit = (data) => {
    createMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Create Team</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {createMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {createMutation.error.response?.data?.error || 'Failed to create team'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Team Name
            </label>
            <input
              type="text"
              className="input"
              placeholder="Engineering Team"
              {...register('name', { required: 'Team name is required' })}
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
              placeholder="What does this team do?"
              {...register('description')}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
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
