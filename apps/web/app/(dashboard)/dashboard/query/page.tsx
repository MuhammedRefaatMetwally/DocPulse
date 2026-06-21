'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { useQueryStream } from '@/hooks/use-query-stream';
import { QueryInput } from '@/components/query/query-input';
import { AnswerDisplay } from '@/components/query/answer-display';
import { QueryHistory } from '@/components/query/query-history';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { Skeleton } from '@/components/ui/skeleton';

export default function QueryPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace, isLoading, isError, hasNoWorkspaces } = useWorkspaces();
  const stream = useQueryStream(currentWorkspace?.id ?? '');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 bg-surface" />
        <Skeleton className="h-14 w-full bg-surface" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-text-secondary text-sm py-12 text-center">
        Couldn&apos;t load your workspace. Refresh the page to try again.
      </p>
    );
  }

  if (hasNoWorkspaces) {
    return <CreateWorkspaceDialog />;
  }

  if (!currentWorkspace) return null;

  const handleAsk = async (query: string) => {
    await stream.ask(query);
    queryClient.invalidateQueries({
      queryKey: ['query-history', currentWorkspace.id],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Query</h1>
        <p className="text-text-secondary text-sm mt-1">
          Ask questions grounded in your indexed documents.
        </p>
      </div>

      <QueryInput
        onSubmit={handleAsk}
        onCancel={stream.cancel}
        isStreaming={stream.isStreaming}
      />

      <AnswerDisplay
        answer={stream.answer}
        sources={stream.sources}
        isStreaming={stream.isStreaming}
        error={stream.error}
        tokensUsed={stream.tokensUsed}
        latencyMs={stream.latencyMs}
      />

      <div className="pt-2">
        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
          History
        </h2>
        <QueryHistory workspaceId={currentWorkspace.id} />
      </div>
    </div>
  );
}