'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { Workspace } from '@/types';
import { AxiosError } from 'axios';

interface FormData {
  name: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function CreateWorkspaceDialog() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { data: workspace } = await api.post<Workspace>('/workspaces', {
        name: data.name,
        slug: slugify(data.name) + '-' + Math.random().toString(36).slice(2, 6),
      });

      queryClient.setQueryData<Workspace[]>(['workspaces'], (old) =>
        old ? [...old, workspace] : [workspace],
      );
      setCurrentWorkspaceId(workspace.id);
      toast.success('Workspace created');
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message ?? 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] fade-slide-in">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="text-text-secondary text-sm mt-1.5">
            Workspaces hold your documents, queries, and team members.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-text-secondary text-xs">
              Workspace name
            </Label>
            <Input
              id="name"
              placeholder="My Team"
              className="bg-surface border-border h-10"
              {...register('name', { required: 'Name is required', minLength: 2 })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">Name is required</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
      </div>
    </div>
  );
}