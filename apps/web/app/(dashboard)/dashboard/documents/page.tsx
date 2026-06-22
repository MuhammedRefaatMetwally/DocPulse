'use client';

import { useQueryClient } from '@tanstack/react-query';
import { UploadZone } from '@/components/documents/upload-zone';
import { DocumentList } from '@/components/documents/document-list';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace, isLoading, isError, hasNoWorkspaces } = useWorkspaces();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-surface" />
        <Skeleton className="h-28 w-full bg-surface" />
        <Skeleton className="h-64 w-full bg-surface" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <AlertCircle className="text-destructive" size={28} />
        <p className="text-text-secondary text-sm">
          Couldn&apos;t load your workspaces. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-border"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['workspaces'] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (hasNoWorkspaces) {
    return <CreateWorkspaceDialog />;
  }

  if (!currentWorkspace) return null;

  return (
    <div className="space-y-8 fade-slide-in">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <p className="text-text-secondary text-sm mt-1">
          Upload PDFs and text files to index for search and Q&A.
        </p>
      </div>

      <UploadZone
        workspaceId={currentWorkspace.id}
        onUploadComplete={() =>
          queryClient.invalidateQueries({
            queryKey: ['documents', currentWorkspace.id],
          })
        }
      />

      <DocumentList workspaceId={currentWorkspace.id} />
    </div>
  );
}