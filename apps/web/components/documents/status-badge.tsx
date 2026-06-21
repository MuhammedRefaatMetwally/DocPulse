import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { ElementType } from 'react';
import { DocumentItem } from '@/types';

type StatusConfig = {
  label: string;
  className: string;
  icon: ElementType;
  spin?: boolean;
};

const config: Record<DocumentItem['status'], StatusConfig> = {
  PENDING: {
    label: 'Pending',
    className: 'text-text-tertiary bg-surface-hover',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Processing',
    className: 'text-accent bg-accent-dim',
    icon: Loader2,
    spin: true,
  },
  COMPLETED: {
    label: 'Indexed',
    className: 'text-text-secondary bg-surface-hover',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    className: 'text-destructive bg-destructive-dim',
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: DocumentItem['status'] }) {
  const { label, className, icon: Icon, spin } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${className}`}>
      <Icon size={11} className={spin ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}