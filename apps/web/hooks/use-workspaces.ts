'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { Workspace } from '@/types';

export function useWorkspaces() {
  const { currentWorkspaceId, setCurrentWorkspaceId } = useWorkspaceStore();

  const {
    data: workspaces,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data } = await api.get<Workspace[]>('/workspaces');
      return data;
    },
  });

  const currentWorkspace = useMemo(() => {
    if (!workspaces || workspaces.length === 0) return null;

    const found = workspaces.find((w) => w.id === currentWorkspaceId);
    return found ?? workspaces[0]; 
  }, [workspaces, currentWorkspaceId]);

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;

    const stillExists = workspaces.some((w) => w.id === currentWorkspaceId);

    if (!currentWorkspaceId || !stillExists) {
      setCurrentWorkspaceId(workspaces[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, currentWorkspaceId]);

  return {
    workspaces: workspaces ?? [],
    currentWorkspace,
    isLoading,
    isError,
    error,
    hasNoWorkspaces: !isLoading && !isError && (workspaces?.length ?? 0) === 0,
  };
}