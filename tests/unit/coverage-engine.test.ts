import { describe, it, expect } from 'vitest';
import { computeRequiredItemRefs, getUncoveredRefs, partitionByPriority, getSessionBudget, MAX_EXERCISES_PER_SESSION } from '../../worker/services/coverageEngine';

describe('coverage engine — required item refs', () => {
  it('returns empty array when fields_json is empty', () => {
    const refs = computeRequiredItemRefs({});
    expect(refs).toHaveLength(0);
  });

  it('extracts core refs from meaning_vi strings', () => {
    const fields = { meaning_vi: ['quả táo', 'trái táo'] };
    const refs = computeRequiredItemRefs(fields);
    expect(refs.some((r) => r.ref === 'meaning_vi.0')).toBe(true);
    expect(refs.some((r) => r.ref === 'meaning_vi.1')).toBe(true);
    expect(refs.every((r) => r.priority === 'core')).toBe(true);
  });

  it('extracts synonym items with value and vi_meaning', () => {
    const fields = {
      synonyms: [
        { value: 'apple', vi_meaning: 'quả táo' },
        { value: 'Malus', vi_meaning: 'chi táo' }
      ]
    };
    const refs = computeRequiredItemRefs(fields);
    expect(refs.some((r) => r.ref === 'synonyms.0.value')).toBe(true);
    expect(refs.some((r) => r.ref === 'synonyms.0.vi_meaning')).toBe(true);
    expect(refs.some((r) => r.ref === 'synonyms.1.value')).toBe(true);
  });

  it('ignores null / empty array items', () => {
    const fields = { meaning_vi: ['valid', '', null], synonyms: [] };
    const refs = computeRequiredItemRefs(fields as any);
    expect(refs.filter((r) => r.ref.startsWith('meaning_vi.')).length).toBe(1);
  });

  it('returns secondary priority for collocations and examples', () => {
    const fields = {
      collocations: [{ value: 'run a business', vi_meaning: 'làm kinh doanh' }],
      example_sentences: ['I run fast.'],
      example_translations: ['Tôi chạy nhanh.']
    };
    const refs = computeRequiredItemRefs(fields);
    const secondary = refs.filter((r) => r.priority === 'secondary');
    expect(secondary.length).toBeGreaterThan(0);
  });

  it('respects MAX_EXERCISES_PER_SESSION constant', () => {
    expect(MAX_EXERCISES_PER_SESSION).toBe(10);
  });
});

describe('coverage engine — uncovered refs', () => {
  it('filters out refs already in coveredThisSession', () => {
    const all = [
      { ref: 'meaning_vi.0', label: 'a', priority: 'core' as const },
      { ref: 'meaning_vi.1', label: 'b', priority: 'core' as const }
    ];
    const uncovered = getUncoveredRefs(all, ['meaning_vi.0'], []);
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].ref).toBe('meaning_vi.1');
  });

  it('also filters refs in coveredInRecentWindow', () => {
    const all = [
      { ref: 'phonetic', label: 'IPA', priority: 'core' as const },
      { ref: 'word_type', label: 'noun', priority: 'core' as const }
    ];
    const uncovered = getUncoveredRefs(all, [], ['word_type']);
    expect(uncovered).toHaveLength(1);
  });

  it('returns all refs when nothing covered', () => {
    const all = [
      { ref: 'a', label: '', priority: 'core' as const },
      { ref: 'b', label: '', priority: 'secondary' as const }
    ];
    expect(getUncoveredRefs(all, [], [])).toEqual(all);
  });
});

describe('coverage engine — priority partition', () => {
  it('separates core from secondary refs', () => {
    const refs = [
      { ref: 'meaning_vi.0', label: '', priority: 'core' as const },
      { ref: 'synonyms.0.value', label: '', priority: 'secondary' as const }
    ];
    const { core, secondary } = partitionByPriority(refs);
    expect(core).toHaveLength(1);
    expect(secondary).toHaveLength(1);
  });
});

describe('session budget per level', () => {
  it('returns correct budget for each level 0–6', () => {
    expect(getSessionBudget(0)).toBe(10);
    expect(getSessionBudget(1)).toBe(8);
    expect(getSessionBudget(2)).toBe(7);
    expect(getSessionBudget(3)).toBe(6);
    expect(getSessionBudget(4)).toBe(5);
    expect(getSessionBudget(5)).toBe(4);
    expect(getSessionBudget(6)).toBe(3);
  });

  it('returns default max for out-of-range levels', () => {
    expect(getSessionBudget(-1)).toBe(MAX_EXERCISES_PER_SESSION);
    expect(getSessionBudget(7)).toBe(MAX_EXERCISES_PER_SESSION);
  });
});
