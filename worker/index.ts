import { Hono } from 'hono';
import type { Env, UserSession } from './types';
import { authRoutes } from './routes/auth';
import { notebookRoutes } from './routes/notebooks';
import { cardRoutes } from './routes/cards';
import { mediaRoutes } from './routes/media';
import { importRoutes } from './routes/import';
import { exportRoutes } from './routes/export';
import { exerciseRoutes } from './routes/exercises';
import { exerciseSessionRoutes } from './routes/exerciseSessions';
import { dashboardRoutes } from './routes/dashboard';
import { enrichmentRoutes } from './routes/enrichment';
import { tutorRoutes } from './routes/tutor';
import { placementRoutes } from './routes/placement';
import { syncRoutes } from './routes/sync';
import { quotaRoutes } from './routes/quota';
import { settingsRoutes } from './routes/settings';
import { csrfProtection } from './middleware/csrf';
import { securityMiddleware, corsMiddleware } from './middleware/security';

type AppBindings = { Bindings: Env; Variables: { user?: UserSession } };

const app = new Hono<AppBindings>();

// Global security + CORS on every response
app.use('*', securityMiddleware);
app.use('*', corsMiddleware);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth routes — no authentication middleware (bootstrap, login are public)
app.route('/api/auth', authRoutes);

// Protected API routes
const protectedApi = app.basePath('/api');

// Session check for all protected routes
protectedApi.use('*', async (c, next) => {
  const token = parseCookie(c.req.header('Cookie') ?? '', 'session_token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  return next();
});

// CSRF protection for state-changing operations on notebook-related routes
protectedApi.use('/notebooks/*', csrfProtection);
protectedApi.use('/exercises/*', csrfProtection);
protectedApi.use('/media/*', csrfProtection);
protectedApi.use('/import/*', csrfProtection);

app.route('/api/notebooks', notebookRoutes);
app.route('/api', cardRoutes);
app.route('/api', mediaRoutes);
app.route('/api', importRoutes);
app.route('/api', exerciseRoutes);
app.route('/api', exerciseSessionRoutes);
app.route('/api', dashboardRoutes);
app.route('/api', enrichmentRoutes);
app.route('/api', tutorRoutes);
app.route('/api', placementRoutes);
app.route('/api', syncRoutes);
app.route('/api/quota', quotaRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/export', exportRoutes);

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = cookieHeader.match(new RegExp('(?:^|;)\\s*' + escapedName + '\\s*=\\s*([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

export default app;
