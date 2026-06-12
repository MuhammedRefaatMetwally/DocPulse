'use client';

import { useWorkspaceStore } from '@/stores/workspace.store';
import { Workspace } from '@/types';

export function useSelectWorkspace() {
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  return (workspace: Workspace) => {
    setCurrentWorkspaceId(workspace.id);
  };
}