import { Badge } from '@/components/ui/badge';
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
    className: 'bg-muted text-muted-foreground',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    icon: Loader2,
    spin: true,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: DocumentItem['status'] }) {
  const { label, className, icon: Icon, spin } = config[status];

  return (
    <Badge variant="outline" className={`gap-1.5 ${className}`}>
      <Icon size={12} className={spin ? 'animate-spin' : ''} />
      {label}
    </Badge>
  );
}