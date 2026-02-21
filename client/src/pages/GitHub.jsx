import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { githubApi } from '../services/api';
import { Github, RefreshCw, ExternalLink, Star, GitFork, Loader2, AlertCircle } from 'lucide-react';

export default function GitHub() {
  const queryClient = useQueryClient();

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['github-profile'],
    queryFn: () => githubApi.getProfile()
  });

  const { data: reposData, isLoading: reposLoading } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => githubApi.getRepos(),
    enabled: !!profileData?.data?.data?.profile
  });

  const syncMutation = useMutation({
    mutationFn: () => githubApi.syncProfile(),
    onSuccess: () => {
      queryClient.invalidateQueries(['github-profile']);
      queryClient.invalidateQueries(['github-repos']);
    }
  });

  const profile = profileData?.data?.data?.profile;
  const repos = reposData?.data?.data?.repos || [];
  const isLoading = profileLoading || reposLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">GitHub Integration</h1>
          <p className="text-slate-600">Connect and manage your GitHub profile</p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          {syncMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
          Sync Profile
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : profile ? (
        <>
          {/* Profile Card */}
          <div className="card">
            <div className="flex items-start gap-4">
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                className="w-16 h-16 rounded-full"
              />
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-800">
                    {profile.name || profile.username}
                  </h2>
                  <a
                    href={profile.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
                <p className="text-slate-500">@{profile.username}</p>
                {profile.bio && (
                  <p className="mt-2 text-slate-600">{profile.bio}</p>
                )}
                <div className="flex items-center gap-6 mt-4">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-700">{profile.publicRepos}</span>
                    <span className="text-slate-500 ml-1">Repositories</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold text-slate-700">{profile.followers}</span>
                    <span className="text-slate-500 ml-1">Followers</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold text-slate-700">{profile.following}</span>
                    <span className="text-slate-500 ml-1">Following</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Repositories */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Repositories ({repos.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repos.map((repo) => (
                <a
                  key={repo.id}
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-slate-700">{repo.name}</h3>
                    <ExternalLink size={14} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                    {repo.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    {repo.language && (
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-primary-500" />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star size={14} />
                      {repo.stargazers_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork size={14} />
                      {repo.forks_count}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="card text-center py-12">
          <Github size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">Connect Your GitHub</h3>
          <p className="text-slate-500 mb-4">
            Link your GitHub account to sync your profile and repositories
          </p>
          <a href="/api/auth/github" className="btn btn-primary inline-flex items-center gap-2">
            <Github size={18} />
            Connect GitHub
          </a>
        </div>
      )}
    </div>
  );
}
