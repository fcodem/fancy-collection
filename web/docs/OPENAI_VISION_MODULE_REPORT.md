# Enterprise OpenAI Dress Checker Implementation Report

## 1) Database Changes

### New Table
- `ai_runtime_settings`
  - Encrypted runtime configuration for OpenAI and AI pipeline tuning.

### Updated Prisma Models
- `ClothingItem`
  - `enhancedPhoto`, `enhancementStatus`, `enhancementError`, `enhancementVersion`, `enhancementUpdatedAt`
- `InventoryAiProfile`
  - `embeddingVector` (`vector(3072)` via pgvector)
  - `promptVersion`, `aiVersion`
  - enhancement telemetry fields (`enhancedImage`, status/error/model/latency/version)
- `InventoryAiProfileVersion`
  - enhancement snapshot fields

### Migrations
- `prisma/migrations/202607091305_openai_vision_module/migration.sql`
- `prisma/migrations/202607091345_pgvector_inventory_ai/migration.sql`
  - Enables `vector` extension.
  - Adds `embedding_vector` column.
  - Adds IVFFlat index for cosine similarity.

## 2) API Routes Added

### AI Settings
- `GET /api/admin/ai/settings`
- `PUT /api/admin/ai/settings`

### AI Enhancement
- `POST /api/ai-tools/image-enhancer/preview`
- `GET /api/admin/ai/metrics`
- `POST /api/admin/ai/enhancement/retry`

### Recognition Admin / Diagnostics
- `GET /api/admin/recognition/queue`
- `GET /api/admin/recognition/diagnostics`
- `POST /api/admin/recognition/retry-failed`
- `POST /api/admin/recognition/search-diagnostics`
- `GET /api/admin/recognition/[id]/metadata`
- `GET /api/admin/recognition/[id]/embedding`

## 3) Queue Implementation

Asynchronous, non-blocking indexing flow:
1. Inventory item is saved immediately.
2. Existing photo pipeline enqueues AI profile generation.
3. Background worker (`scheduleInventoryAiProfile`) processes:
   - OpenAI Vision metadata
   - OpenAI embeddings
   - pgvector persistence
   - optional image enhancement
4. Profile status/logs updated with retries.

No booking/inventory CRUD behavior was blocked by AI operations.

## 4) AI Workflow (Hybrid Retrieval)

### Inventory Indexing
1. Normalize image.
2. Extract structured metadata via OpenAI Vision (`/v1/responses`).
3. Generate embedding via OpenAI (`/v1/embeddings`).
4. Store metadata + embedding snapshot in `InventoryAiProfile`.
5. Persist embedding vector to PostgreSQL pgvector (`embedding_vector`).

### Search
1. Query image -> OpenAI Vision metadata.
2. Query embedding generated via OpenAI.
3. PostgreSQL pgvector retrieves Top-5 nearest candidates.
4. Only Top-5 candidates are sent to OpenAI Vision for reranking.
5. Final output includes best match, confidence, explanation, ranking.

Confidence gating:
- `>=95`: identified
- `85-95`: review required (Top-5 shown)
- `<85`: no reliable match

## 5) Storage Changes

- Original image is preserved (`photo`) and never overwritten.
- Enhanced image is separate (`enhancedPhoto`).
- Customer-facing photo resolution prefers enhanced image with original fallback.

## 6) pgvector Configuration

- Extension: `CREATE EXTENSION IF NOT EXISTS vector`
- Column: `inventory_ai_profiles.embedding_vector vector(3072)`
- Index: IVFFlat cosine index for efficient nearest-neighbor retrieval.
- Querying handled by raw SQL through Prisma (`<=>` cosine distance).

## 7) OpenAI Integration Points

- Vision metadata extraction (structured attributes + description).
- Embedding generation for retrieval.
- Top-5 visual reranking.
- Image enhancement pipeline.

Runtime model configuration is managed in `ai_runtime_settings` and can be updated from Admin UI.

## 8) Cost Optimization Strategy

- Hybrid retrieval reduces expensive multimodal comparisons to Top-5 only.
- Embeddings reused from stored inventory profile; not regenerated on each search.
- Image normalization/compression before API calls.
- Retry/backoff on transient failures.
- Optional quality/size tuning via AI Settings.

## 9) Security and Reliability

- API key stored encrypted (or from env fallback).
- AI routes restricted to authenticated users/owner where needed.
- Basic in-memory rate limiting added to AI-heavy endpoints.
- Error handling with retries and status logging.
- Original inventory data preserved even when AI calls fail.

## 10) Vercel Deployment Guide

Required services only:
- Vercel
- PostgreSQL with pgvector enabled
- Cloudflare R2 or Supabase Storage (or Vercel Blob currently supported in app)
- OpenAI API key

Deployment steps:
1. Set env vars: `DATABASE_URL`, `SESSION_SECRET`, `OPENAI_API_KEY`, `AI_SETTINGS_SECRET`.
2. Run migrations (`prisma migrate deploy`) during build.
3. Ensure object storage token is configured for production uploads.
4. Open `Admin -> AI Settings` and set model/runtime values.

No Docker, Python worker, GPU server, or external vector database required.

## 11) Future Scalability Considerations

- Partition profile tables by item status/category when data volume grows.
- Move rate limiter to Redis for distributed limits across instances.
- Add job table-based queue for cross-instance durable processing.
- Add periodic re-index tasks for model upgrades with rolling migration flags.
- Add per-category prompt templates/versioning for tighter precision tuning.
