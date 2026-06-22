'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { User } from '@/types';
import { AxiosError } from 'axios';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      await api.post('/auth/register', data);
      const { data: user } = await api.get<User>('/auth/me');
      setUser(user);
      toast.success(`Welcome to DocPulse, ${user.name}`);
      router.push('/dashboard/documents');
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-slide-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-text-secondary text-sm mt-1.5">
          Start indexing documents in minutes
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-text-secondary text-xs">Name</Label>
          <Input
            id="name"
            placeholder="Jordan Lee"
            autoComplete="name"
            className="bg-surface border-border h-10"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

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
            placeholder="Min 8 characters"
            autoComplete="new-password"
            className="bg-surface border-border h-10"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Min 8 characters' },
            })}
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
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-sm text-text-secondary text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}