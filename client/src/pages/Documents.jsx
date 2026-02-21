import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '../services/api';
import {
  FileSpreadsheet, Upload, Download, RefreshCw, Loader2, File,
  FileText, Table2, ExternalLink
} from 'lucide-react';

export default function Documents() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploadError, setUploadError] = useState('');
  const [activeTab, setActiveTab] = useState('excel');

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.getAll()
  });

  const { data: googleDocsData, isLoading: googleLoading } = useQuery({
    queryKey: ['google-docs'],
    queryFn: () => documentsApi.getGoogleDocs()
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => documentsApi.uploadExcel(file),
    onSuccess: () => {
      queryClient.invalidateQueries(['documents']);
      setUploadError('');
    },
    onError: (error) => {
      setUploadError(error.response?.data?.error || 'Upload failed');
    }
  });

  const syncGoogleMutation = useMutation({
    mutationFn: () => documentsApi.syncGoogleDocs(),
    onSuccess: () => {
      queryClient.invalidateQueries(['google-docs']);
    }
  });

  const documents = docsData?.data?.data?.documents || [];
  const googleDocs = googleDocsData?.data?.data?.docs || [];

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleExport = async (type, id) => {
    try {
      let response;
      if (type === 'team') {
        response = await documentsApi.exportTeamExcel(id);
      } else {
        response = await documentsApi.exportProjectExcel(id);
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}_export_${new Date().toISOString()}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Documents</h1>
          <p className="text-slate-600">Manage Excel files and Google Docs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('excel')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'excel'
              ? 'text-primary-600 border-primary-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet size={18} />
            Excel Files
          </span>
        </button>
        <button
          onClick={() => setActiveTab('google')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'google'
              ? 'text-primary-600 border-primary-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <FileText size={18} />
            Google Docs
          </span>
        </button>
      </div>

      {/* Excel Tab */}
      {activeTab === 'excel' && (
        <div className="space-y-6">
          {/* Upload Section */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Upload Excel File</h2>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {uploadError}
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={32} className="animate-spin text-primary-600" />
                  <p className="text-slate-600">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={32} className="text-slate-400" />
                  <p className="text-slate-600">Click to upload or drag and drop</p>
                  <p className="text-sm text-slate-400">XLSX, XLS, or CSV files</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents List */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Uploaded Documents</h2>
            
            {docsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-primary-600" size={24} />
              </div>
            ) : documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Table2 size={20} className="text-green-600" />
                      <div>
                        <p className="font-medium text-slate-700">{doc.name}</p>
                        <p className="text-sm text-slate-500">
                          {new Date(doc.createdAt).toLocaleDateString()} • {doc.type}
                        </p>
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-sm">
                      <Download size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No documents uploaded yet</p>
            )}
          </div>
        </div>
      )}

      {/* Google Docs Tab */}
      {activeTab === 'google' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => syncGoogleMutation.mutate()}
              disabled={syncGoogleMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              {syncGoogleMutation.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <RefreshCw size={18} />
              )}
              Sync from Google Drive
            </button>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Google Documents</h2>
            
            {googleLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-primary-600" size={24} />
              </div>
            ) : googleDocs.length > 0 ? (
              <div className="space-y-3">
                {googleDocs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <File size={20} className="text-blue-600" />
                      <div>
                        <p className="font-medium text-slate-700">{doc.name}</p>
                        <p className="text-sm text-slate-500">
                          {new Date(doc.modifiedTime).toLocaleDateString()} • {doc.mimeType?.split('.').pop()}
                        </p>
                      </div>
                    </div>
                    <ExternalLink size={16} className="text-slate-400" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <File size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No Google Docs synced yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Connect Google Drive and sync to see your documents
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
