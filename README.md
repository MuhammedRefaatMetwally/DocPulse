# DocPulse

A multi-tenant document intelligence platform that lets teams upload PDFs and text files and query them with AI-powered semantic search and streaming responses.

Built as a learning project to understand what actually goes into a production RAG pipeline — from async ingestion workers to pgvector similarity search to streaming LLM responses.

> **Demo:** [Watch the Loom walkthrough →](https://your-loom-link-here)

---

## What It Does

1. Upload a PDF or text file to a workspace
2. The document gets queued and processed asynchronously — parsed, chunked, and embedded
3. Ask a question in plain English
4. The system searches your documents semantically and streams a grounded AI answer back in real time, with source citations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│              Next.js  · shadcn/ui · Zustand               │
│         React Query · SSE fetch stream · httpOnly auth       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP + SSE
┌────────────────────────▼────────────────────────────────────┐
│                      NestJS API                             │
│  Auth  │  Workspaces  │  Documents  │  Ingestion  │  Query  │
│  JWT httpOnly cookies · RBAC guard · WorkspaceRoleGuard     │
└───┬──────────────────────────┬──────────────────────────────┘
    │                          │
    ▼                          ▼
┌───────────┐          ┌───────────────┐
│  BullMQ   │          │  PostgreSQL   │
│  Worker   │─────────▶│  + pgvector   │
│  Queue    │  UNNEST  │  HNSW Index   │
└───────────┘  INSERT  └───────────────┘
    │                          │
    ▼                          ▼
┌───────────┐          ┌───────────────┐
│  Gemini   │          │     Groq      │
│ Embeddings│          │  (LLM Chat)   │
└───────────┘          └───────────────┘
    │
    ▼
┌───────────┐
│  Upstash  │
│  Redis    │
└───────────┘
```

### Ingestion Flow

```
Upload PDF
    │
    ▼
Documents API ──── create DB record (PENDING) ──── enqueue BullMQ job
                                                          │
                                                          ▼
                                                   BullMQ Worker
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                     Parse PDF       Chunk text      Embed batch
                                     (pdf-parse)    (512c / 64c     (Gemini, 20
                                                      overlap)       texts/call)
                                                                          │
                                                                          ▼
                                                              UNNEST bulk INSERT
                                                              into PostgreSQL
                                                              (1 query / 100 chunks)
                                                                          │
                                                                          ▼
                                                              Document → COMPLETED
```

### Query Flow

```
User question
    │
    ▼
Embed with RETRIEVAL_QUERY task type (Gemini)
    │
    ▼
pgvector cosine similarity search
    WHERE similarity >= 0.5 (noise filter)
    LIMIT 8, max 2 chunks per document (diversity)
    │
    ▼
Build context string (max 8000 chars)
    │
    ▼
Stream response from Groq (llama-3.3-70b-versatile)
    │
    ▼
SSE chunks → frontend (token by token)
    │
    ▼
Save to query_history (fire and forget)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS 11 |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 7 |
| Job queue | BullMQ 5 + Redis (Upstash) |
| Embeddings | Google Gemini `gemini-embedding-001` |
| Chat generation | Groq `llama-3.3-70b-versatile` (OpenAI-compatible) |
| Frontend | Next.js , shadcn/ui, Tailwind CSS |
| State management | React Query (server state) + Zustand (UI state) |
| Auth | JWT · httpOnly cookies · refresh token rotation |
| Hosting | Neon (PostgreSQL) · Upstash (Redis) |

---

## Key Engineering Decisions

### 1. Async ingestion with BullMQ

PDF processing is not done inline on the request thread. The upload handler returns immediately after creating a database record and enqueuing a job. The BullMQ worker handles everything else.

Worker concurrency is set to 3. Gemini's free tier is 15 RPM. With batch sizes of 20 texts per embedding call, 3 workers stay comfortably under the limit.

Failed jobs classify errors explicitly: `UnrecoverableError` for permanent failures (document deleted, empty PDF) vs. transient errors that get exponential backoff retry. The ingestion job and document status are kept in sync across every state transition — both move from `QUEUED → PROCESSING → COMPLETED/FAILED` atomically.

### 2. UNNEST bulk insert for vector data

Prisma's `createMany()` throws an `Invalid invocation` error at runtime when any model field uses `Unsupported("vector(1536)")` — a confirmed upstream limitation. The fix is raw SQL using PostgreSQL's UNNEST to zip parallel typed arrays into rows:

```sql
INSERT INTO document_chunks
  (id, "documentId", "workspaceId", content, "chunkIndex",
   "startChar", "endChar", embedding, "createdAt")
SELECT
  gen_random_uuid(), $1, $2,
  t.content, t.chunk_index, t.start_char, t.end_char,
  t.embedding::vector, NOW()
FROM UNNEST(
  $3::text[], $4::int[], $5::int[], $6::int[], $7::text[]
) AS t(content, chunk_index, start_char, end_char, embedding)
```

One query per 100 chunks instead of one per chunk. Reduces DB round-trips from O(n) to O(⌈n/100⌉).

> **Gotcha discovered in production:** the Prisma schema had no `@map()` directives, so PostgreSQL columns were created with camelCase names (`"documentId"`, not `document_id`). All raw SQL must use quoted identifiers. Confirmed via `information_schema.columns` after a `42703: column does not exist` error.

### 3. Asymmetric embeddings

Gemini's `text-embedding-001` model supports task-specific embeddings. Documents are indexed with `RETRIEVAL_DOCUMENT` task type. Queries are embedded with `RETRIEVAL_QUERY` task type. These produce vectors in slightly different semantic spaces that are trained for asymmetric retrieval — using the wrong task type measurably degrades recall quality.

### 4. pgvector with similarity thresholding

The similarity search uses cosine distance (`<=>` operator) with an HNSW index for approximate nearest-neighbor lookup. A hard threshold of `1 - distance >= 0.5` filters out low-signal chunks before they reach the LLM. A document diversity filter caps results at 2 chunks per source document in application code, preventing a large document from monopolizing the context window.

### 5. SSE streaming via raw Express response

NestJS's `@Sse()` decorator is effectively GET-only — it establishes the EventSource connection before body parsing runs, causing all DTO validators to receive `undefined`. The fix is a plain `@Post()` route with `@Res()` injection, manually setting `Content-Type: text/event-stream` headers and subscribing to the RxJS Observable directly:

```typescript
res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
res.flushHeaders();

const subscription = observable.subscribe({
  next: (event) => res.write(`data: ${event.data}\n\n`),
  complete: () => res.end(),
});

res.on('close', () => subscription.unsubscribe()); // client disconnect cleanup
```

### 6. httpOnly cookie auth in NestJS

Tokens are never stored in `localStorage`. NestJS sets `httpOnly` cookies directly on the Express response using `@Res({ passthrough: true })`. The JWT Passport strategy reads the access token from the cookie first, with a Bearer header fallback for Swagger. Refresh tokens are stored as SHA-256 hashes in PostgreSQL — the raw token lives only in the cookie, never in the database.

### 7. Hybrid AI provider strategy

The system uses two AI providers for different tasks:

- **Gemini** for embeddings only — `gemini-embedding-001` with 1536 output dimensions
- **Groq** for chat generation — `llama-3.3-70b-versatile` via OpenAI-compatible SDK

This split happened mid-project when Gemini's free tier returned `limit: 0` on `generateContent` calls — a Google account-state issue (not a rate limit), which was unblocked by switching to Groq. Because Groq is OpenAI-compatible, the swap required only changing `baseURL` and `apiKey` with zero other code changes.

### 8. State management split

React Query owns all server state (workspace list, documents, query history). Zustand persists only `currentWorkspaceId` — a single string — using `partialize`. The `currentWorkspace` object is derived via `useMemo` from React Query's live data on every render, never stored separately. This eliminates the dual-cache staleness problem that occurs when server data lives in both React Query and Zustand simultaneously.

---

## Project Structure

```
docpulse/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT, cookies, refresh rotation
│   │   │   │   ├── workspaces/     # Multi-tenancy, RBAC
│   │   │   │   ├── documents/      # Upload, storage
│   │   │   │   ├── ingestion/      # BullMQ processor, chunking
│   │   │   │   ├── embeddings/     # Gemini embedding service
│   │   │   │   └── retrieval/      # pgvector search, SSE, Groq
│   │   │   ├── common/
│   │   │   │   ├── guards/         # JwtAuthGuard, WorkspaceRoleGuard
│   │   │   │   ├── decorators/     # @CurrentUser, @WorkspaceRoles
│   │   │   │   └── enums/          # WorkspaceRole hierarchy
│   │   │   └── database/           # PrismaService
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   └── web/                        # Next.js  frontend
│       └── src/
│           ├── app/
│           │   ├── (auth)/         # Login, register pages
│           │   └── (dashboard)/    # Protected routes
│           ├── components/
│           │   ├── documents/      # Upload zone, document list
│           │   ├── query/          # Query input, answer display, history
│           │   └── layout/         # Sidebar, providers
│           ├── hooks/              # useAuth, useWorkspaces, useQueryStream
│           └── stores/             # Zustand auth + workspace stores
```

---

## Local Setup

### Prerequisites

- Node.js 22+
- Docker (for local Redis, optional — Upstash works too)
- Neon account (free PostgreSQL + pgvector)
- Upstash account (free Redis)
- Google AI Studio API key (Gemini embeddings)
- Groq API key (chat generation)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/docpulse.git
cd docpulse
cd apps/api && npm install
cd ../web && npm install
```

### 2. Set up environment variables

```bash
# apps/api/.env
DATABASE_URL="postgresql://...@neon.tech/docpulse?sslmode=require"
DIRECT_URL="postgresql://...@neon.tech/docpulse?sslmode=require"  # non-pooled for migrations
REDIS_URL="rediss://:password@xxx.upstash.io:6380"

JWT_SECRET="your-64-char-secret"
JWT_REFRESH_SECRET="your-other-64-char-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

GEMINI_API_KEY="AIza..."
OPENAI_EMBEDDING_MODEL="gemini-embedding-001"

GROQ_API_KEY="gsk_..."
GROQ_CHAT_MODEL="llama-3.3-70b-versatile"

NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3001
LOCAL_STORAGE_PATH=./uploads

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### 3. Enable pgvector on Neon

Run this in the Neon SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Run database migrations

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

### 5. Start the development servers

```bash
# Terminal 1 — API
cd apps/api && npm run dev

# Terminal 2 — Frontend
cd apps/web && npm run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001)
