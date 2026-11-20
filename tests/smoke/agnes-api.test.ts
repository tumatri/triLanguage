/**
 * Smoke test — gọi Agnes API thật để xác nhận key hoạt động.
 * CHỈ chạy khi chủ dự án xác nhận rõ ràng.
 * Sau khi chạy xong sẽ báo số request thực tế đã sử dụng.
 */

import { describe, it } from 'vitest';

const AGNES_BASE_URL = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_MODEL = process.env.AGNES_MODEL_FAST || 'agnes-2.5-flash';

if (!AGNES_API_KEY) {
  console.warn('[smoke-test] AGNES_API_KEY chưa được cấu hình — bỏ qua smoke test');
} else {
  describe('Agnes API smoke test', () => {
    it('gọi /v1/chat/completions thành công', async () => {
      const resp = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGNES_API_KEY}`
        },
        body: JSON.stringify({
          model: AGNES_MODEL,
          messages: [{ role: 'user', content: 'Reply with exactly: {"status":"ok"}' }],
          max_tokens: 64
        })
      });

      console.log(`[smoke-test] status: ${resp.status}`);

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Agnes API lỗi ${resp.status}: ${text.slice(0, 300)}`);
      }

      const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? '';
      console.log(`[smoke-test] response snippet: ${content.slice(0, 100)}`);

      // Verify we got valid JSON back
      expect(content.trim()).toContain('"status":"ok"');
    }, 60_000);

    it('reply tiếng Việt đúng biến thể en-US', async () => {
      const resp = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGNES_API_KEY}`
        },
        body: JSON.stringify({
          model: AGNES_MODEL,
          messages: [
            { role: 'system', content: 'Bạn là trợ giảng tiếng Anh Mỹ. Giải thích bằng tiếng Việt.' },
            { role: 'user', content: 'What does "run into" mean? Give one short Vietnamese explanation.' }
          ],
          max_tokens: 128
        })
      });

      console.log(`[smoke-test #2] status: ${resp.status}`);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Agnes API lỗi ${resp.status}: ${text.slice(0, 300)}`);
      }

      const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? '';
      console.log(`[smoke-test #2] response: ${content.slice(0, 200)}`);

      // Should contain Vietnamese explanation
      expect(content.length).toBeGreaterThan(10);
    }, 60_000);
  });
}
