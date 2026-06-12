'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { getSafeRedirectPath } from '@/lib/redirect';
import { User } from '@/types';
import { AxiosError } from 'axios';

interface LoginForm { email: string; password: string }

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const redirectTo = getSafeRedirectPath(searchParams.get('from'), '/dashboard');

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
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your DocPulse account</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com"
              autoComplete="email"
              {...register('email', { required: 'Email is required' })} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••"
              autoComplete="current-password"
              {...register('password', { required: 'Password is required' })} />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary hover:underline">Sign up</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

function LoginSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
      <CardFooter><Skeleton className="h-10 w-full" /></CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginFormContent />
    </Suspense>
  );
}