'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from './status-badge';
import { Trash2, FileText, AlertCircle, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { DocumentItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<DocumentItem[]>(
        `/workspaces/${workspaceId}/documents`,
      );
      return data;
    },
    refetchInterval: (query) => {
      const docs = query.state.data as DocumentItem[] | undefined;
      const hasActive = docs?.some(
        (d) => d.status === 'PENDING' || d.status === 'PROCESSING',
      );
      return hasActive ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await api.delete(`/workspaces/${workspaceId}/documents/${documentId}`);
    },
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] });
    },
    onError: () => toast.error('Failed to delete document'),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full bg-surface" />
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
        <Inbox className="text-text-tertiary mb-3" size={28} />
        <p className="text-sm font-medium">No documents yet</p>
        <p className="text-xs text-text-tertiary mt-1">
          Upload a file above to start building your knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">
        <span>Name</span>
        <span className="text-right">Chunks</span>
        <span className="text-right">Size</span>
        <span className="text-right">Uploaded</span>
        <span className="w-8" />
      </div>

      {documents.map((doc, i) => (
        <div
          key={doc.id}
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-3 py-3 rounded-md hover:bg-surface/60 transition-colors group fade-slide-in"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={15} className="text-text-tertiary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm truncate">{doc.originalName}</p>
              {doc.status === 'FAILED' && doc.errorMessage ? (
                <p className="text-xs text-destructive truncate flex items-center gap-1 mt-0.5">
                  <AlertCircle size={10} />
                  {doc.errorMessage}
                </p>
              ) : (
                <div className="mt-0.5">
                  <StatusBadge status={doc.status} />
                </div>
              )}
            </div>
          </div>

          <span className="text-sm text-text-tertiary text-right font-mono">
            {doc.status === 'COMPLETED' ? doc.chunkCount : '—'}
          </span>

          <span className="text-sm text-text-tertiary text-right font-mono">
            {formatBytes(doc.sizeBytes)}
          </span>

          <span className="text-sm text-text-tertiary text-right">
            {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
          </span>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-surface border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription className="text-text-secondary">
                  &quot;{doc.originalName}&quot; and its indexed chunks will be
                  permanently removed. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate(doc.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}