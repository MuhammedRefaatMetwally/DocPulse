import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SourceList } from './source-list';
import { QuerySource } from '@/types';

interface AnswerDisplayProps {
  answer: string;
  sources: QuerySource[];
  isStreaming: boolean;
  error: string | null;
  tokensUsed: number | null;
  latencyMs: number | null;
}

export function AnswerDisplay({
  answer,
  sources,
  isStreaming,
  error,
  tokensUsed,
  latencyMs,
}: AnswerDisplayProps) {
  if (error) {
    return (
      <div className="px-4 py-3 rounded-md border border-destructive/30 bg-destructive-dim">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!answer && !isStreaming && sources.length === 0) return null;

  return (
    <div className="space-y-4 fade-slide-in">
      <SourceList sources={sources} animate />

      {(answer || isStreaming) && (
        <div className="px-4 py-3 rounded-md bg-surface border border-border">
          {answer ? (
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              {isStreaming && <span className="streaming-cursor" />}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-text-tertiary text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              Searching documents…
            </div>
          )}

          {!isStreaming && tokensUsed !== null && latencyMs !== null && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-text-tertiary font-mono">
              <span>{tokensUsed} tokens</span>
              <span>·</span>
              <span>{(latencyMs / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}