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
    className: 'text-warning bg-warning-dim dark:bg-warning-dim/30 border border-warning/20 dark:border-warning/30',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Processing',
    className: 'text-accent bg-accent-dim dark:bg-accent-dim/30 border border-accent/20 dark:border-accent/30',
    icon: Loader2,
    spin: true,
  },
  COMPLETED: {
    label: 'Indexed',
    className: 'text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    className: 'text-destructive bg-destructive-dim dark:bg-destructive-dim/30 border border-destructive/20 dark:border-destructive/30',
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: DocumentItem['status'] }) {
  const { label, className, icon: Icon, spin } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      <Icon size={12} className={spin ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}