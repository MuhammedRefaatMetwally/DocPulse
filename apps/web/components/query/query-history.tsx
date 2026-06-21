'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { QueryHistoryResponse } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SourceList } from './source-list';

export function QueryHistory({ workspaceId }: { workspaceId: string }) {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['query-history', workspaceId, page],
    queryFn: async () => {
      const { data } = await api.get<QueryHistoryResponse>(
        `/workspaces/${workspaceId}/query/history`,
        { params: { page, limit: 10 } },
      );
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-surface" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary text-sm py-6">
        <MessageSquare size={14} />
        Past queries will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.items.map((item) => (
        <Collapsible
          key={item.id}
          open={openId === item.id}
          onOpenChange={(open) => setOpenId(open ? item.id : null)}
        >
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-md text-left hover:bg-surface transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{item.query}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  {' · '}
                  {item.sources.length} source{item.sources.length !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronDown
                size={14}
                className={`shrink-0 ml-2 text-text-tertiary transition-transform ${
                  openId === item.id ? 'rotate-180' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 pt-1 space-y-3">
            <SourceList sources={item.sources} />
            <div className="prose px-3 py-2.5 rounded-md bg-bg border border-border">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-tertiary font-mono">
              <span>{item.tokensUsed} tokens</span>
              <span>·</span>
              <span>{(item.latencyMs / 1000).toFixed(1)}s</span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}

      {data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-3">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-text-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-text-tertiary font-mono">
            {data.meta.page} / {data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-border text-text-secondary"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}