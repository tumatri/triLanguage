# triLanguage — Deployment Guide (Vercel + Supabase)
# Full step-by-step guide: docs/DEPLOYMENT_VERCEL.md

## Quick Deploy Checklist

### Prerequisites
- [ ] GitHub account
- [ ] Supabase account (free): https://supabase.com/dashboard
- [ ] Agnes AI API key: https://apihub.agnes-ai.com

### Step 1: Create Supabase Project
1. Sign up at supabase.com → New project
2. Region: Singapore | Save your database password
3. Get credentials from Settings → API

### Step 2: Run Migration
```powershell
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@db.XXX.supabase.co:5432/postgres"
node scripts/db-migrate.mjs
```

### Step 3: Create Storage Bucket
1. Storage → New bucket → name: `media`, Public: ON
2. SQL Editor → Run RLS policies (see DEPLOYMENT_VERCEL.md)

### Step 4: Push to GitHub
```powershell
git remote add origin https://github.com/YOUR_USER/triLanguage.git
git push -u origin master
```

### Step 5: Deploy to Vercel
1. vercel.com/dashboard → Add New → Project
2. Select `triLanguage` repo → Import
3. Framework: Other | Build: `npm run build` | Output: `dist`
4. Add environment variables (see table below)
5. Redeploy

### Required Environment Variables
| Variable | Source | Required |
|---|---|---|
| SUPABASE_URL | Supabase Settings → API | ✅ Yes |
| SUPABASE_ANON_KEY | Supabase Settings → API | ✅ Yes |
| SUPABASE_SERVICE_ROLE_KEY | Supabase Settings → API | ✅ Yes (Production only) |
| AGNES_API_KEY | Your Agnes console | ✅ Yes |
| SESSION_SECRET | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | ✅ Yes |
| AGNES_BASE_URL | Default OK | Optional |
| AGNES_MODEL_FAST | Default: agnes-2.5-flash | Optional |
| AGNES_TIMEOUT_MS | Default: 45000 | Optional |
| AGNES_MAX_RPM | Default: 12 | Optional |
| SESSION_TTL_SECONDS | Default: 86400 | Optional |

### Post-Deploy Verification
1. Visit: https://YOUR_PROJECT.vercel.app/bootstrap
2. Create admin account (first user becomes owner)
3. Login and create first notebook
4. Test AI enrichment on a card
5. Upload test image/audio to verify Storage works

## Auto-Deploy
Every `git push origin master` triggers automatic deploy via Vercel webhook.
No manual deployment needed after initial setup.

## Cost
$0/month within free tier limits (~100K req/day, 1GB DB, 1GB storage)
