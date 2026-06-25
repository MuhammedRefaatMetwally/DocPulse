'use client';

import { useState, useRef, useCallback } from 'react';
import { QuerySource, SseEvent } from '@/types';

interface UseQueryStreamResult {
  answer: string;
  sources: QuerySource[];
  isStreaming: boolean;
  error: string | null;
  tokensUsed: number | null;
  latencyMs: number | null;
  ask: (query: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useQueryStream(workspaceId: string): UseQueryStreamResult {
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<QuerySource[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setAnswer('');
    setSources([]);
    setError(null);
    setTokensUsed(null);
    setLatencyMs(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const ask = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      reset();
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/workspaces/${workspaceId}/query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', 
            body: JSON.stringify({ query }),
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        if (!res.body) {
          throw new Error('No response body');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const messages = buffer.split('\n\n');
          buffer = messages.pop() ?? ''; 

          for (const message of messages) {
            const line = message.trim();
            if (!line.startsWith('data:')) continue;

            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as SseEvent;

              switch (event.type) {
                case 'sources':
                  setSources(event.sources);
                  break;
                case 'delta':
                  setAnswer((prev) => prev + event.content);
                  break;
                case 'done':
                  setTokensUsed(event.tokensUsed);
                  setLatencyMs(event.latencyMs);
                  break;
                case 'error':
                  setError(event.message);
                  break;
              }
            } catch {
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        setError('Failed to get a response. Please try again.');
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [workspaceId, isStreaming, reset],
  );

  return { answer, sources, isStreaming, error, tokensUsed, latencyMs, ask, cancel, reset };
}