import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { teamsApi, projectsApi } from '../services/api';
import { Users, Plus, Settings, Trash2, UserPlus, X, Loader2, FolderKanban, ArrowLeft } from 'lucide-react';

export default function TeamDetail() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => teamsApi.getById(teamId)
  });

  const { data: projectsData } = useQuery({
    queryKey: ['team-projects', teamId],
    queryFn: () => projectsApi.getAll({ teamId })
  });

  const deleteMutation = useMutation({
    mutationFn: () => teamsApi.delete(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries(['teams']);
      navigate('/teams');
    }
  });

  const team = data?.data?.data?.team;
  const projects = projectsData?.data?.data?.projects || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-700">Team not found</h2>
        <button onClick={() => navigate('/teams')} className="btn btn-primary mt-4">
          Back to Teams
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/teams')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft size={18} />
        Back to Teams
      </button>

      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-100 rounded-lg">
              <Users size={24} className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{team.name}</h1>
              <p className="text-slate-500">{team.description || 'No description'}</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="btn btn-secondary"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Members */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Members ({team.members?.length || 0})
            </h2>
            <button
              onClick={() => setShowAddMember(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              <UserPlus size={16} />
              Add
            </button>
          </div>

          <div className="space-y-3">
            {team.members?.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                teamId={teamId}
                isOwner={team.ownerId === member.userId}
              />
            ))}
          </div>
        </div>

        {/* Projects */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Projects ({projects.length})
            </h2>
            <button
              onClick={() => navigate('/projects', { state: { teamId } })}
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              <Plus size={16} />
              New
            </button>
          </div>

          {projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="w-full text-left p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FolderKanban size={18} className="text-slate-400" />
                      <span className="font-medium text-slate-700">{project.name}</span>
                    </div>
                    <span className={`badge ${
                      project.status === 'ACTIVE' ? 'badge-success' :
                      project.status === 'COMPLETED' ? 'badge-info' : 'badge-warning'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-6">No projects yet</p>
          )}
        </div>
      </div>

      {showAddMember && (
        <AddMemberModal teamId={teamId} onClose={() => setShowAddMember(false)} />
      )}

      {showSettings && (
        <TeamSettingsModal
          team={team}
          onClose={() => setShowSettings(false)}
          onDelete={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
}

function MemberCard({ member, teamId, isOwner }) {
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => teamsApi.removeMember(teamId, member.userId),
    onSuccess: () => queryClient.invalidateQueries(['team', teamId])
  });

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-200 rounded-full flex items-center justify-center">
          <span className="text-primary-700 font-medium">
            {member.user.firstName?.[0]}{member.user.lastName?.[0]}
          </span>
        </div>
        <div>
          <p className="font-medium text-slate-700">
            {member.user.firstName} {member.user.lastName}
          </p>
          <p className="text-sm text-slate-500">{member.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`badge ${
          member.role === 'OWNER' ? 'badge-warning' :
          member.role === 'ADMIN' ? 'badge-info' : 'badge-success'
        }`}>
          {member.role}
        </span>
        {!isOwner && (
          <button
            onClick={() => removeMutation.mutate()}
            className="text-slate-400 hover:text-red-600"
            disabled={removeMutation.isPending}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function AddMemberModal({ teamId, onClose }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const addMutation = useMutation({
    mutationFn: (data) => teamsApi.addMember(teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['team', teamId]);
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => addMutation.mutate(data))} className="p-6 space-y-4">
          {addMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {addMutation.error.response?.data?.error || 'Failed to add member'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              className="input"
              placeholder="member@company.com"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Role
            </label>
            <select className="input" {...register('role')}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {addMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              Add Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamSettingsModal({ team, onClose, onDelete }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: { name: team.name, description: team.description }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => teamsApi.update(team.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['team', team.id]);
      queryClient.invalidateQueries(['teams']);
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Team Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Team Name
            </label>
            <input type="text" className="input" {...register('name')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea className="input" rows={3} {...register('description')} />
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
                if (confirm('Are you sure you want to delete this team?')) {
                  onDelete();
                }
              }}
              className="btn btn-danger w-full"
            >
              Delete Team
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
