import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../services/api';
import {
  Settings, Users, Shield, FileText, Activity, AlertTriangle,
  Loader2, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { format } from 'date-fns';

export default function Admin() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-slate-600" />
          Admin Dashboard
        </h1>
        <p className="text-slate-600">System administration and monitoring</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Overview', icon: Activity },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'security', label: 'Security', icon: Shield },
          { id: 'audit', label: 'Audit Logs', icon: FileText }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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

      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminApi.getDashboard()
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  const stats = data?.data?.data || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats.totalUsers || 0} icon={Users} color="blue" />
        <StatCard title="Active Teams" value={stats.totalTeams || 0} icon={Users} color="green" />
        <StatCard title="Projects" value={stats.totalProjects || 0} icon={Activity} color="purple" />
        <StatCard title="Security Incidents" value={stats.openIncidents || 0} icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h3>
          {stats.recentActivity?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400">
                    {format(new Date(activity.createdAt), 'MMM d, HH:mm')}
                  </span>
                  <span className="text-slate-700">{activity.action}</span>
                  <span className="text-slate-500">{activity.user?.email}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-4">No recent activity</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">System Health</h3>
          <div className="space-y-3">
            <HealthItem label="Database" status="healthy" />
            <HealthItem label="Redis Cache" status="healthy" />
            <HealthItem label="API Server" status="healthy" />
            <HealthItem label="Background Jobs" status="healthy" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600'
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{title}</p>
        </div>
      </div>
    </div>
  );
}

function HealthItem({ label, status }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`badge ${status === 'healthy' ? 'badge-success' : 'badge-danger'}`}>
        {status}
      </span>
    </div>
  );
}

function UsersTab() {
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => adminApi.getRoles()
  });

  const roles = rolesData?.data?.data?.roles || [];

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Roles & Permissions</h3>
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800">{role.name}</h4>
                  <p className="text-sm text-slate-500">{role.description}</p>
                </div>
                <span className="badge badge-info">{role._count?.users || 0} users</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {role.permissions?.slice(0, 5).map((perm) => (
                  <span key={perm.id} className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                    {perm.name}
                  </span>
                ))}
                {role.permissions?.length > 5 && (
                  <span className="text-xs text-slate-500">
                    +{role.permissions.length - 5} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecurityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['security-incidents'],
    queryFn: () => adminApi.getSecurityIncidents()
  });

  const incidents = data?.data?.data?.incidents || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Security Incidents</h3>
      
      {incidents.length > 0 ? (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <div key={incident.id} className="p-4 bg-slate-50 rounded-lg border-l-4 border-l-red-500">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-slate-800">{incident.type}</h4>
                  <p className="text-sm text-slate-600 mt-1">{incident.description}</p>
                </div>
                <span className={`badge ${
                  incident.severity === 'CRITICAL' ? 'badge-danger' :
                  incident.severity === 'HIGH' ? 'badge-warning' : 'badge-info'
                }`}>
                  {incident.severity}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span>{format(new Date(incident.detectedAt), 'MMM d, yyyy HH:mm')}</span>
                <span className={`badge ${
                  incident.status === 'OPEN' ? 'badge-danger' :
                  incident.status === 'INVESTIGATING' ? 'badge-warning' : 'badge-success'
                }`}>
                  {incident.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Shield size={32} className="mx-auto text-green-500 mb-2" />
          <p className="text-slate-600">No security incidents</p>
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [expandedLog, setExpandedLog] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => adminApi.getAuditLogs({ page, limit: 20 })
  });

  const logs = data?.data?.data?.logs || [];
  const pagination = data?.data?.data?.pagination || {};

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Audit Logs</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Timestamp</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">User</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Action</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Resource</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">IP</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600"></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <>
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-600">
                    {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{log.user?.email || 'System'}</td>
                  <td className="py-3 px-4">
                    <span className="badge badge-info">{log.action}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{log.resourceType}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-xs">{log.ipAddress}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {expandedLog === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </td>
                </tr>
                {expandedLog === log.id && (
                  <tr key={`${log.id}-details`}>
                    <td colSpan={6} className="bg-slate-50 px-4 py-3">
                      <pre className="text-xs text-slate-600 overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
