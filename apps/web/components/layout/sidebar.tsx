'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileStack,
  Sparkles,
  Settings,
  LogOut,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';
import { useWorkspaces } from '@/hooks/use-workspaces';

const navItems = [
  { href: '/dashboard/documents', label: 'Documents', icon: FileStack },
  { href: '/dashboard/query', label: 'Query', icon: Sparkles },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const user = useAuthStore((s) => s.user);
  const { currentWorkspace } = useWorkspaces();

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="w-60 flex flex-col h-screen sticky top-0 bg-bg border-r border-border">
      {/* Workspace switcher */}
      <div className="p-3">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-surface-hover transition-colors group">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-accent-dim text-accent text-xs font-semibold shrink-0">
            {currentWorkspace?.name?.[0]?.toUpperCase() ?? 'D'}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium truncate leading-tight">
              {currentWorkspace?.name ?? 'DocPulse'}
            </p>
            <p className="text-[11px] text-text-tertiary leading-tight">
              Workspace
            </p>
          </div>
          <ChevronsUpDown
            size={14}
            className="text-text-tertiary shrink-0 group-hover:text-text-secondary transition-colors"
          />
        </button>
      </div>

      <div className="h-px bg-border mx-3" />

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
          Workspace
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href} className="block">
              <span
                className={cn(
                  'relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-surface text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                )}
              >
                {/* Signature: activity accent line on active item */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent rounded-full" />
                )}
                <Icon size={16} className={isActive ? 'text-accent' : ''} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-hover text-text-primary text-xs font-medium shrink-0 border border-border">
            {initials ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{user?.name}</p>
            <p className="text-[11px] text-text-tertiary truncate leading-tight">
              {user?.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-text-tertiary hover:text-destructive shrink-0"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </Button>
        </div>
      </div>
    </aside>
  );
}