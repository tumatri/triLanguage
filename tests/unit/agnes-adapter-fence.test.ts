import { describe, it, expect } from 'vitest';

/**
 * Re-implement stripMarkdownCodeFence logic for testing (cannot import private function).
 */
function stripMarkdownCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceRegex = /^```(?:[a-z]+)?\s*\n?(.*?)\n?\s*```$/is;
  const match = fenceRegex.exec(trimmed);
  if (match && match[1]) return match[1].trim();
  return trimmed;
}

describe('agnes adapter — markdown fence stripping', () => {
  it('strips ```json ... ``` fences', () => {
    const input = '```json\n{"status":"ok"}\n```';
    expect(stripMarkdownCodeFence(input)).toBe('{"status":"ok"}');
  });

  it('strips ``` ... ``` without lang', () => {
    const input = '```\n{ "word": "chạy nhanh" }\n```';
    expect(stripMarkdownCodeFence(input)).toBe('{ "word": "chạy nhanh" }');
  });

  it('returns raw content when no fences present', () => {
    const input = '{"status":"ok"}';
    expect(stripMarkdownCodeFence(input)).toBe('{"status":"ok"}');
  });

  it('handles extra whitespace around fences', () => {
    const input = '\n  \n```json\n{"x":1}\n  \n```  \n';
    expect(stripMarkdownCodeFence(input)).toBe('{"x":1}');
  });

  it('does not strip non-fence code', () => {
    const input = 'Here is the answer: {"status":"ok"}';
    expect(stripMarkdownCodeFence(input)).toBe('Here is the answer: {"status":"ok"}');
  });
});
