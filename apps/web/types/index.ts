export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count?: {
    members: number;
    documents: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuerySource {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  answer: string;
  sources: QuerySource[];
  tokensUsed: number;
  latencyMs: number;
  createdAt: string;
}

export interface QueryHistoryResponse {
  items: QueryHistoryItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type SseEvent =
  | { type: 'sources'; sources: QuerySource[] }
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number; latencyMs: number }
  | { type: 'error'; message: string };