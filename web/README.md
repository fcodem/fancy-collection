# Fancy Collection — Next.js (Vercel)

Next.js + PostgreSQL migration of the Flask cloth rental app in `../fancynew/`.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + React 19 |
| API | Next.js Route Handlers (`/api/*`) |
| Database | PostgreSQL via Prisma (Neon / Vercel Postgres / Supabase) |
| Auth | iron-session (owner + staff approval flow) |
| Uploads | `public/uploads/` locally, **Vercel Blob** in production |

## Quick Start (Local)

```powershell
cd web
copy .env.example .env
# Set DATABASE_URL and SESSION_SECRET

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open **http://localhost:3000** — login: `owner` / `admin123`

## Deploy to Vercel

### 1. Create PostgreSQL database

**Neon (recommended):**
1. Create project at [neon.tech](https://neon.tech)
2. Copy connection string → `DATABASE_URL`

**Vercel Postgres:**
1. Import project, set Root Directory to `web`
2. Storage → Postgres → auto-injects `DATABASE_URL`

### 2. Deploy

1. Push repo to GitHub
2. [vercel.com](https://vercel.com) → Import → Root Directory: `web`
3. Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | 32+ char random string |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob for photo uploads |
| `NEXT_PUBLIC_APP_URL` | No | Your deployed URL |

4. Deploy

### 3. Initialize database

```bash
cd web
npx prisma db push
npm run db:seed
```

Or via Vercel CLI: `vercel env pull && npx prisma db push`

### 4. Migrate existing SQLite data

Your data is in `fancynew/cloth_rental.db`:

```powershell
pip install psycopg2-binary
cd web
# Ensure DATABASE_URL is set in .env
python ../scripts/migrate_sqlite_to_postgres.py
```

This copies all 16 tables preserving IDs and relationships.

### 5. Copy assets & uploads

```powershell
cd web
npm run copy-assets
```

Copies `style.css` and `dress-suggest.js` from Flask static folder.
For item photos, copy `fancynew/static/uploads/*` to `web/public/uploads/` before deploy, or use Vercel Blob (set `BLOB_READ_WRITE_TOKEN`).

## File uploads

- **Local dev:** files saved to `public/uploads/`
- **Vercel production:** set `BLOB_READ_WRITE_TOKEN` — uploads go to Vercel Blob (URLs stored in DB)
- Photo search compares uploaded image against stored item photos (average-hash, same as Flask)

## Migrated features

- Auth (owner login, staff approval, force logout)
- Dashboard + dress checker + free-item finder
- Booking CRUD with conflict rules, monthly serial, Sherwani size labels
- Delivery / return / packing list / recycle bin
- Inventory CRUD + dress search + photo search
- All 8 finance reports + suppliers
- Staff attendance & work reports
- Customers, users, categories, CSV export
- GST bill print, legacy rentals/billing views

## Project structure

```
web/
├── prisma/schema.prisma
├── scripts/copy-assets.mjs
├── src/app/api/          # ~48 API routes
├── src/app/              # All pages
├── src/components/       # Client UI
├── src/lib/              # Business logic
├── public/css/style.css
└── vercel.json
```
