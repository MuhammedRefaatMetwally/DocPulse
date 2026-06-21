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
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <AlertCircle className="text-destructive" size={32} />
        <p className="text-muted-foreground">
          Failed to load workspaces. Check your connection and try again.
        </p>
        <Button
          variant="outline"
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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Upload documents to {currentWorkspace.name} for AI-powered search.
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