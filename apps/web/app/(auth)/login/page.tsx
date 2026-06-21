'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { getSafeRedirectPath } from '@/lib/redirect';
import { User } from '@/types';
import { AxiosError } from 'axios';

interface LoginForm {
  email: string;
  password: string;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const redirectTo = getSafeRedirectPath(searchParams.get('from'), '/dashboard/documents');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await api.post('/auth/login', data);
      const { data: user } = await api.get<User>('/auth/me');
      setUser(user);
      toast.success(`Welcome back, ${user.name}`);
      router.push(redirectTo);
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-slide-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-text-secondary text-sm mt-1.5">
          Sign in to query your documents
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-text-secondary text-xs">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="bg-surface border-border h-10"
            {...register('email', { required: 'Email is required' })}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-text-secondary text-xs">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className="bg-surface border-border h-10"
            {...register('password', { required: 'Password is required' })}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-10 bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-sm text-text-secondary text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40 bg-surface" />
      <Skeleton className="h-4 w-56 bg-surface" />
      <Skeleton className="h-10 w-full bg-surface mt-6" />
      <Skeleton className="h-10 w-full bg-surface" />
      <Skeleton className="h-10 w-full bg-surface" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginFormContent />
    </Suspense>
  );
}