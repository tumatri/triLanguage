import { describe, it, expect } from 'vitest';
import { computeDuplicateHash, normalizeLatinFront, normalizeCJKFront } from '../../worker/lib/duplicateHash';

describe('duplicate hash utility', () => {
  describe('normalizeLatinFront', () => {
    it('lowercases and trims', () => {
      expect(normalizeLatinFront('  Apple  ')).toBe('apple');
    });

    it('collapses whitespace', () => {
      expect(normalizeLatinFront('hello   world')).toBe('hello world');
    });

    it('strips trailing punctuation', () => {
      expect(normalizeLatinFront('Hello!')).toBe('hello');
    });

    it('preserves numbers and special chars in body', () => {
      expect(normalizeLatinFront('test-123!')).toBe('test-123');
    });

    it('handles empty string', () => {
      expect(normalizeLatinFront('')).toBe('');
    });
  });

  describe('normalizeCJKFront', () => {
    it('trims and collapses whitespace for Chinese text', () => {
      expect(normalizeCJKFront(' 蘋果 ', true)).toBe('蘋果');
    });

    it('does not lowercase CJK characters', () => {
      // CJK characters have no case; verify they stay intact
      const result = normalizeCJKFront('苹果', true);
      expect(result).toBe('苹果');
    });
  });

  describe('computeDuplicateHash', () => {
    it('produces consistent hash for same inputs', async () => {
      const h1 = await computeDuplicateHash('nb-1', 'en-US', 'vocab', 'apple');
      const h2 = await computeDuplicateHash('nb-1', 'en-US', 'vocab', 'apple');
      expect(h1).toBe(h2);
      expect(h1.length).toBe(64); // SHA-256 hex
    });

    it('differs by notebook_id', async () => {
      const h1 = await computeDuplicateHash('nb-a', 'en-US', 'vocab', 'apple');
      const h2 = await computeDuplicateHash('nb-b', 'en-US', 'vocab', 'apple');
      expect(h1).not.toBe(h2);
    });

    it('differs by language_variant', async () => {
      const h1 = await computeDuplicateHash('nb-1', 'zh-Hant', 'vocab', '蘋果');
      const h2 = await computeDuplicateHash('nb-1', 'zh-Hans', 'vocab', '蘋果');
      expect(h1).not.toBe(h2);
    });

    it('treats normalised duplicates as same', async () => {
      const h1 = await computeDuplicateHash('nb-1', 'en-US', 'vocab', 'Apple!');
      const h2 = await computeDuplicateHash('nb-1', 'en-US', 'vocab', ' apple  ');
      expect(h1).toBe(h2);
    });

    it('different card types produce different hashes for same text', async () => {
      const h1 = await computeDuplicateHash('nb-1', 'en-US', 'vocab', 'run');
      const h2 = await computeDuplicateHash('nb-1', 'en-US', 'sentence', 'run');
      expect(h1).not.toBe(h2);
    });

    it('Chinese text produces different hash from Latin "pinguo"', async () => {
      const h1 = await computeDuplicateHash('nb-1', 'zh-Hant', 'vocab', '蘋果');
      const h2 = await computeDuplicateHash('nb-1', 'zh-Hant', 'vocab', 'pinguo');
      expect(h1).not.toBe(h2);
    });
  });
});
