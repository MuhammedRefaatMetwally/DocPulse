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