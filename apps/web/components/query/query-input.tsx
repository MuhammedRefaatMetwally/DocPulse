'use client';

import { useState, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Square } from 'lucide-react';

interface QueryInputProps {
  onSubmit: (query: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
}

export function QueryInput({ onSubmit, onCancel, isStreaming }: QueryInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative rounded-lg border border-border bg-surface focus-within:border-border-strong transition-colors">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about your documents…"
        className="resize-none min-h-[52px] max-h-40 border-0 bg-transparent pr-12 focus-visible:ring-0 focus-visible:outline-none"
        rows={1}
      />
      <div className="absolute right-2 bottom-2">
        {isStreaming ? (
          <Button onClick={onCancel} size="icon" className="h-7 w-7 bg-surface-hover hover:bg-border text-text-primary">
            <Square size={12} />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!value.trim()}
            size="icon"
            className="h-7 w-7 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-30 disabled:bg-surface-hover"
          >
            <ArrowUp size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}