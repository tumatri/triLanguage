// api/enrichment/notebooks/[notebookId]/cards/[cardId]/enrich.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY!
);

function getSessionCookie(req: NextApiRequest): string | undefined {
  return req.headers.cookie?.match(/session_token=([^;]*)/)?.[1];
}

async function getUser(token: string) {
  const { data: s } = await supabase.from('sessions').select('user_id')
    .eq('token_hash', token).eq('revoked_at', null).gt('expires_at', new Date().toISOString()).single();
  return s?.user_id ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = getSessionCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const userId = await getUser(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { notebookId, cardId } = req.query as { notebookId?: string; cardId?: string };
  if (!notebookId || !cardId) return res.status(400).json({ error: 'notebookId and cardId required' });

  // Verify card ownership
  const { data: card } = await supabase
    .from('cards').select('id, fields_json').eq('id', cardId).eq('notebook_id', notebookId).is('archived_at', null).single();
  if (!card) return res.status(404).json({ error: 'Card not found' });

  // Check rate limit
  const { data: limitRow } = await supabase
    .from('ai_rate_limits').select('request_count').eq('notebook_id', notebookId).eq('provider', 'agnes').single();
  const count = limitRow?.request_count ?? 0;
  const maxRpm = parseInt(process.env.AGNES_MAX_RPM ?? '12', 10);
  if (count >= maxRpm) return res.status(429).json({ error: 'Rate limit exceeded. Please wait.' });

  // Call Agnes AI
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

  const model = process.env.AGNES_MODEL_FAST ?? 'agnes-2.5-flash';
  const baseURL = process.env.AGNES_BASE_URL ?? 'https://apihub.agnes-ai.com/v1';
  const timeout = parseInt(process.env.AGNES_TIMEOUT_MS ?? '45000', 10);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `Enrich the following vocabulary card with Vietnamese meanings, synonyms, and example sentences. Return valid JSON only.\n\nFront text: ${card.front_text}\nCurrent fields: ${card.fields_json ?? 'none'}` }],
        max_tokens: 512
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Agnes API error: ${errText.slice(0, 200)}` });
    }

    type JsonChoice = { message?: { content?: string } };
    const json = await resp.json() as { choices?: JsonChoice[] };
    const content = json.choices?.[0]?.message?.content ?? '';
    const enrichedFields = (() => { try { return JSON.parse(content); } catch { return null; } })();

    // Increment rate limit counter
    await supabase.rpc('increment_ai_rate_limit', { p_notebook_id: notebookId }).single();

    return res.json({ success: true, enriched_fields: enrichedFields ?? {} });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('AbortError')) {
      return res.status(408).json({ error: 'Request timeout' });
    }
    return res.status(500).json({ error: msg });
  }
}
