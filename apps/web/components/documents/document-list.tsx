'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from './status-badge';
import { Trash2, FileText, AlertCircle } from 'lucide-react';
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
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="mx-auto mb-2" size={32} />
        <p>No documents yet. Upload one to get started.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="font-medium max-w-xs">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate">{doc.originalName}</span>
              </div>
              {doc.status === 'FAILED' && doc.errorMessage && (
                <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                  <AlertCircle size={12} />
                  <span className="truncate">{doc.errorMessage}</span>
                </div>
              )}
            </TableCell>
            <TableCell>
              <StatusBadge status={doc.status} />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {doc.status === 'COMPLETED' ? doc.chunkCount : '—'}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatBytes(doc.sizeBytes)}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
            </TableCell>
            <TableCell>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &quot;{doc.originalName}&quot;
                      and all its indexed chunks. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate(doc.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}