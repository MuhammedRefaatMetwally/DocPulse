'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { Skeleton } from '@/components/ui/skeleton';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-mono text-text-primary">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { currentWorkspace, isLoading } = useWorkspaces();

  if (isLoading || !user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 bg-surface" />
        <Skeleton className="h-40 w-full bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-slide-in">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-text-secondary text-sm mt-1">
          Account and workspace details.
        </p>
      </div>

      <div>
        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
          Account
        </h2>
        <div className="rounded-lg border border-border bg-surface px-4">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
        </div>
      </div>

      {currentWorkspace && (
        <div>
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
            Workspace
          </h2>
          <div className="rounded-lg border border-border bg-surface px-4">
            <Field label="Name" value={currentWorkspace.name} />
            <Field label="Slug" value={currentWorkspace.slug} />
            <Field
              label="Documents"
              value={String(currentWorkspace._count?.documents ?? 0)}
            />
            <Field
              label="Members"
              value={String(currentWorkspace._count?.members ?? 0)}
            />
          </div>
        </div>
      )}
    </div>
  );
}