# triLanguage — Học ngoại ngữ cá nhân (Supabase)

Ứng dụng PWA học từ vựng/ngoại ngữ với:

- **Mastery 0–6** + **FSRS-6** scheduling
- **Notebook-scoped CRUD** (card, media, import, exercises)
- **AI enrichment/tutoring** qua Agnes (OpenAI-compatible)
- **Offline-first** với IndexedDB outbox sync
- **Supabase** PostgreSQL + Storage thay thế Cloudflare D1/R2

## Quick start

```bash
# 1. Cài dependencies
pnpm install

# 2. Khởi tạo Supabase database
#    Lấy DATABASE_URL từ Supabase Dashboard → Settings → Database
cp .env.example .env.local
# Chỉnh sửa .env.local với thông tin Supabase của bạn

# 3. Chạy migration SQL
node scripts/db-migrate.mjs

# 4. Tạo bucket "media" trong Supabase Storage Dashboard

# 5. Khởi động server API (Node.js)
npm run server:dev

# 6. Khởi động frontend (Vite dev server tự proxy /api → :8787)
npm run dev
```

## Deploy

### Frontend → GitHub Pages (tự động khi push main)

Push lên GitHub → CI chạy test/build → CD deploy xuống GitHub Pages.
Cần bật Pages trong Settings → Pages → Source: GitHub Actions.

### Backend → Render / Railway / Fly.io

Server là Node.js thuần (`src/server.ts`). Deploy bằng cách chọn:
- **Render**: Web Service, build command `npm run build`, start `npm run server:start`
- **Railway**: tương tự, set env vars trong dashboard
- **Fly.io**: cần `fly.toml`

## Architecture

Xem `docs/ARCHITECTURE.md`.

## Tests

```bash
pnpm test           # Chạy tất cả tests
pnpm test:watch     # Watch mode
```

## CI/CD

| Workflow | Khi nào chạy | Làm gì |
|---|---|---|
| `ci.yml` | Push/Pull Request vào main | TypeScript check + 157 tests + lint + Vite build |
| `deploy-pages.yml` | Sau CI thành công | Deploy `dist/` ra GitHub Pages |

## Stack

- **Frontend**: React 19 + Vite 6 + Tailwind + Dexie (IndexedDB)
- **Backend**: Hono + Node.js (thay Cloudflare Workers)
- **Database**: Supabase PostgreSQL
- **Media storage**: Supabase Storage bucket `media`
- **AI**: Agnes OpenAI-compatible adapter (chat completions)
- **Scheduling**: `ts-fsrs@6` (FSRS-6)
