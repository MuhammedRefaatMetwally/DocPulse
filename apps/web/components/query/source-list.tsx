import { FileText } from 'lucide-react';
import { QuerySource } from '@/types';

export function SourceList({ sources, animate }: { sources: QuerySource[]; animate?: boolean }) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
        Sources
      </p>
      <div className="space-y-1">
        {sources.map((source, i) => (
          <div
            key={source.chunkId}
            className={`flex items-center gap-2.5 text-sm px-3 py-2 rounded-md bg-surface border border-border ${
              animate ? 'fade-slide-in' : ''
            }`}
            style={animate ? { animationDelay: `${i * 120}ms` } : undefined}
          >
            <span className="font-mono text-xs text-text-tertiary w-4 shrink-0">
              {i + 1}
            </span>
            <FileText size={13} className="text-text-tertiary shrink-0" />
            <span className="truncate flex-1">{source.documentName}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-12 h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${source.score * 100}%` }}
                />
              </div>
              <span className="font-mono text-xs text-text-tertiary w-9 text-right">
                {(source.score * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}