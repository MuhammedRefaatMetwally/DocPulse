'use client';

import { useCallback, useState } from 'react';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { Progress } from '@/components/ui/progress';
import { UploadCloud, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { AxiosError } from 'axios';

const MAX_SIZE = 25 * 1024 * 1024;

const acceptedFileTypes: Accept = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
};

interface UploadZoneProps {
  workspaceId: string;
  onUploadComplete: () => void;
}

export function UploadZone({ workspaceId, onUploadComplete }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      for (const rejection of rejectedFiles) {
        toast.error(
          `${rejection.file.name}: ${rejection.errors[0]?.message ?? 'Invalid file'}`,
        );
      }

      if (acceptedFiles.length === 0) return;

      for (const file of acceptedFiles) {
        setFileName(file.name);
        setUploading(true);
        setProgress(0);

        const formData = new FormData();
        formData.append('file', file);

        try {
          await api.post(
            `/workspaces/${workspaceId}/documents/upload`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (e) => {
                setProgress(Math.round((e.loaded * 100) / (e.total ?? 1)));
              },
            },
          );
          toast.success(`${file.name} uploaded`, {
            description: 'Processing started — this may take a moment.',
          });
          onUploadComplete();
        } catch (err) {
          const error = err as AxiosError<{ message: string }>;
          toast.error(`Couldn't upload ${file.name}`, {
            description: error.response?.data?.message ?? 'Try again.',
          });
        }
      }

      setUploading(false);
      setProgress(0);
    },
    [workspaceId, onUploadComplete],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: MAX_SIZE,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`group relative rounded-lg border border-dashed transition-all cursor-pointer
        ${isDragActive
          ? 'border-accent bg-accent/[0.04]'
          : 'border-border hover:border-border-strong hover:bg-surface/50'}
        ${uploading ? 'pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />

      <div className="flex items-center gap-4 p-5">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 transition-colors
            ${isDragActive ? 'bg-accent-dim text-accent' : 'bg-surface text-text-tertiary group-hover:text-text-secondary'}`}
        >
          {uploading ? <FileText size={18} /> : <UploadCloud size={18} />}
        </div>

        {uploading ? (
          <div className="flex-1 space-y-1.5 min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <Progress value={progress} className="h-1 bg-surface" />
          </div>
        ) : (
          <div className="flex-1">
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop to upload' : 'Drag a file here, or click to browse'}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              PDF or TXT, up to 25MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}