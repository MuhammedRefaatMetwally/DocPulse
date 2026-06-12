'use client';

import { useAuthStore } from '@/stores/auth.store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FileText, Search, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your documents and query your knowledge base.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <FileText size={20} className="text-primary" />
            <CardTitle className="text-base mt-2">Documents</CardTitle>
            <CardDescription>
              Upload PDFs and text files to your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" className="w-full">
              <Link href="/dashboard/documents">Manage documents</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <Search size={20} className="text-primary" />
            <CardTitle className="text-base mt-2">Query</CardTitle>
            <CardDescription>
              Ask questions about your documents with AI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" className="w-full">
              <Link href="/dashboard/query">Start querying</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <Zap size={20} className="text-primary" />
            <CardTitle className="text-base mt-2">Quick start</CardTitle>
            <CardDescription>
              Upload a document, then ask it anything
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/dashboard/documents">Get started</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}