import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';
import { authApi, usersApi } from '../services/api';
import { User, Shield, Key, Loader2, Check, AlertCircle } from 'lucide-react';

export default function Profile() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Profile Settings</h1>
        <p className="text-slate-600">Manage your account settings and security</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'security', label: 'Security', icon: Shield },
          { id: 'mfa', label: 'Two-Factor Auth', icon: Key }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-primary-600 border-primary-600'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <tab.icon size={18} />
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab user={user} onUpdate={updateUser} />}
      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'mfa' && <MfaTab user={user} />}
    </div>
  );
}

function ProfileTab({ user, onUpdate }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      firstName: user?.firstName,
      lastName: user?.lastName,
      department: user?.department || '',
      position: user?.position || ''
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => usersApi.update(user.id, data),
    onSuccess: (response) => {
      onUpdate(response.data.data.user);
    }
  });

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Personal Information</h2>

      <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
        {updateMutation.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
            <Check size={16} />
            Profile updated successfully
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              className="input"
              {...register('firstName', { required: 'First name is required' })}
            />
            {errors.firstName && (
              <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              className="input"
              {...register('lastName', { required: 'Last name is required' })}
            />
            {errors.lastName && (
              <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            type="email"
            className="input bg-slate-50"
            value={user?.email}
            disabled
          />
          <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Department
            </label>
            <input
              type="text"
              className="input"
              placeholder="Engineering"
              {...register('department')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Position
            </label>
            <input
              type="text"
              className="input"
              placeholder="Software Engineer"
              {...register('position')}
            />
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {updateMutation.isPending && <Loader2 size={18} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

function SecurityTab() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const [error, setError] = useState('');

  const changePasswordMutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      reset();
      setError('');
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to change password');
    }
  });

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Change Password</h2>

      <form onSubmit={handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-4">
        {changePasswordMutation.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
            <Check size={16} />
            Password changed successfully
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Current Password
          </label>
          <input
            type="password"
            className="input"
            {...register('currentPassword', { required: 'Current password is required' })}
          />
          {errors.currentPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.currentPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            New Password
          </label>
          <input
            type="password"
            className="input"
            {...register('newPassword', {
              required: 'New password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' }
            })}
          />
          {errors.newPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.newPassword.message}</p>
          )}
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {changePasswordMutation.isPending && <Loader2 size={18} className="animate-spin" />}
            Change Password
          </button>
        </div>
      </form>
    </div>
  );
}

function MfaTab({ user }) {
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const { register, handleSubmit, reset } = useForm();

  const setupMutation = useMutation({
    mutationFn: () => authApi.setupMfa(),
    onSuccess: (response) => {
      setQrCode(response.data.data.qrCode);
      setSecret(response.data.data.secret);
    }
  });

  const verifyMutation = useMutation({
    mutationFn: (data) => authApi.verifyMfa(data.token),
    onSuccess: () => {
      setQrCode(null);
      setSecret(null);
      reset();
    }
  });

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Two-Factor Authentication</h2>

      {user?.mfaEnabled ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-700">
            <Check size={20} />
            <span className="font-medium">Two-factor authentication is enabled</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            Your account is protected with an authenticator app.
          </p>
        </div>
      ) : qrCode ? (
        <div className="space-y-4">
          <p className="text-slate-600">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          
          <div className="flex justify-center">
            <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500 mb-1">Manual entry code:</p>
            <code className="text-sm font-mono text-slate-700">{secret}</code>
          </div>

          <form onSubmit={handleSubmit((data) => verifyMutation.mutate(data))} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                className="input text-center text-xl tracking-widest max-w-xs"
                placeholder="000000"
                maxLength={6}
                {...register('token', { required: true })}
              />
            </div>

            <button
              type="submit"
              disabled={verifyMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              {verifyMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              Verify and Enable
            </button>
          </form>
        </div>
      ) : (
        <div>
          <p className="text-slate-600 mb-4">
            Add an extra layer of security to your account by enabling two-factor authentication.
          </p>
          <button
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {setupMutation.isPending && <Loader2 size={18} className="animate-spin" />}
            Set Up Two-Factor Auth
          </button>
        </div>
      )}
    </div>
  );
}
