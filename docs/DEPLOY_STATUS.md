# triLanguage — Deployment Status

## Current State
- **Frontend**: ✅ Live at https://trilanguage.vercel.app (200 OK)
- **Backend APIs**: ✅ Deployed (see notes below about verification)
- **Database**: ✅ Supabase PostgreSQL with all 16 tables created
- **CI/CD**: ✅ GitHub Actions on every `git push` → builds, tests, deploys to Vercel

## Deployment Info
- **Vercel Project**: baba-vanga/trilanguage
- **Production URL**: https://trilanguage.vercel.app
- **Latest Deployment**: dpl_CLksAVYqffaReaxPV2WooZadCKhN

## API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/auth/bootstrap` | GET | ✅ Tested | Returns `{can_bootstrap: true/false}` |
| `/api/auth/bootstrap` | POST | ✅ Logic complete | Creates owner via Supabase Auth + DB insert |
| `/api/notebooks` | GET | ✅ Code ready | Requires auth session |
| `/api/notebooks` | POST | ✅ Code ready | Requires auth session |
| `/api/cards` | GET/POST | ✅ Code ready | Requires auth session |
| `/api/dashboard/*` | GET | ✅ Code ready | Requires auth session |

## Key Technical Details

### PostgREST Schema Cache Issue
During development, we encountered a PostgREST schema cache issue where tables existed in Supabase but weren't visible through the REST API. This was resolved by:
1. Using direct REST API calls with explicit headers
2. Adding retry logic that forces schema reload on cache misses
3. The debug endpoint confirmed database connectivity works correctly

### Authentication Flow
1. First user calls `POST /api/auth/bootstrap` with email/password
2. Handler creates user via Supabase Auth (`auth/signUp`)
3. Then inserts into `users` table for app-specific data
4. Subsequent logins use `POST /api/auth/login` → session token in cookie

### Body Parsing
The Vercel Node.js runtime requires manual body parsing for JSON requests. The bootstrap handler uses stream-based reading to ensure compatibility across all request types.

## CI/CD Pipeline
`.github/workflows/ci.yml`:
1. `npm install --legacy-peer-deps`
2. `npx tsc --noEmit` (type check)
3. `npx vitest run` (tests)
4. `npm run lint` (linting)
5. `npm run build` (production build)
6. Auto-deploys to Vercel production

## Next Steps for Full Verification
Due to Vercel Security Checkpoint, programmatic API testing from this machine is blocked. To verify the full flow:
1. Open https://trilanguage.vercel.app in browser
2. Create account via bootstrap form
3. Create notebook
4. Add flashcards
5. Test AI enrichment
