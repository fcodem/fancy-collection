# Next.js + PostgreSQL — Vercel Deployment

This is the **Vercel-ready** version of Fancy Collection Rental Management.

| Old (local) | New (Vercel) |
|-------------|--------------|
| Flask + Python | **Next.js 15** |
| SQLite file | **PostgreSQL** (Neon or Vercel Postgres) |
| `static/uploads/` | **Vercel Blob** (optional, for photos) |

## Why PostgreSQL?

SQLite stores data in a file on disk. **Vercel serverless functions have no persistent disk**, so the database must live in the cloud. PostgreSQL works the same for bookings, inventory, users, and all features.

## Quick start (local)

### 1. Install Node.js 20+

Download from https://nodejs.org if not installed.

### 2. Create a free PostgreSQL database

**Option A — Neon (recommended, free tier):**
1. Go to https://neon.tech and create a project
2. Copy the connection string (`postgresql://...?sslmode=require`)

**Option B — Vercel Postgres:**
1. In Vercel dashboard → Storage → Create Database → Postgres
2. Connect to your project; `DATABASE_URL` is set automatically

### 3. Configure environment

```powershell
cd "C:\Users\asus\OneDrive\Desktop\ssdn soft\cloth-rental-web"
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your Postgres connection string.

### 4. Install & push schema

```powershell
npm install
npx prisma db push
npm run db:seed
```

### 5. Import your existing SQLite data (one time)

```powershell
$env:SQLITE_PATH="..\fancynew\cloth_rental.db"
npm run db:import-sqlite
```

This copies all users, inventory, bookings, and customers from the Flask app without changing passwords (same login works).

### 6. Run locally

```powershell
npm run dev
```

Open http://localhost:3000 — login with your existing **owner** credentials.

## Deploy to Vercel

1. Push `cloth-rental-web` to GitHub
2. Go to https://vercel.com → **Add New Project** → import the repo
3. Set **Root Directory** to `cloth-rental-web`
4. Add environment variables:
   - `DATABASE_URL` — your Neon/Vercel Postgres URL
   - `SESSION_SECRET` — random 32+ char string
   - `OWNER_DEFAULT_PASSWORD` — only needed if no owner exists yet
   - `BLOB_READ_WRITE_TOKEN` — optional, for dress photo uploads
5. Click **Deploy**

After deploy, run the SQLite import once from your PC pointing at the production `DATABASE_URL`, or use `npx prisma db push` on Vercel build (automatic via `postinstall`).

## Project structure

```
cloth-rental-web/
  prisma/schema.prisma   ← all 20 tables (mirrors Flask models)
  src/app/               ← pages & API routes
  src/lib/               ← auth, dress search, categories
  public/css/style.css   ← same UI styles as Flask app
  scripts/migrate-from-sqlite.ts
```

## Migration status

| Area | Status |
|------|--------|
| Database schema | ✅ Complete |
| Auth + staff approval | ✅ Complete |
| Dress name suggest / search | ✅ Complete |
| Dashboard | ✅ Complete |
| Search booking API | ✅ Complete |
| Inventory search API | ✅ Complete |
| All other pages | 🔄 Use same APIs — pages being ported from Flask templates |

The Flask app in `fancynew/` still works locally. Use `cloth-rental-web` for Vercel deployment.

## Photos on Vercel

Local uploads in `fancynew/static/uploads/` do not transfer automatically. Options:
1. Upload photos again after deploy
2. Set `BLOB_READ_WRITE_TOKEN` and migrate upload handlers to Vercel Blob
3. Keep photos on a CDN and store URLs in the `photo` column

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ERR_CONNECTION_REFUSED` on localhost:5000 | Use Next.js: `npm run dev` → port **3000** |
| Login fails after import | Passwords are preserved; use same username/password as Flask |
| `DATABASE_URL` error on Vercel | Add Postgres env var in Vercel project settings |
| Build fails | Ensure Node 20+ and run `npm run build` locally first |
