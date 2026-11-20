import { describe, it, expect } from 'vitest';
import { validateExerciseRefs, hasAnyFieldData, isValidRefFormat } from '../../worker/services/exerciseValidator';

describe('exercise validator — valid refs', () => {
  it('accepts refs that match real card data', () => {
    const fields = { meaning_vi: ['quả táo', 'trái táo'], word_type: 'noun' };
    const result = validateExerciseRefs(fields, ['meaning_vi.0', 'word_type']);
    expect(result.valid).toBe(true);
    expect(result.invalidRefs).toHaveLength(0);
  });

  it('accepts parent-path refs like "synonyms"', () => {
    const fields = { synonyms: [{ value: 'a', vi_meaning: 'aa' }] };
    const result = validateExerciseRefs(fields, ['synonyms']);
    expect(result.valid).toBe(true);
  });

  it('reports missing refs as invalid', () => {
    const fields = { meaning_vi: ['x'] };
    const result = validateExerciseRefs(fields, ['meaning_vi.0', 'nonexistent_field']);
    expect(result.valid).toBe(false);
    expect(result.invalidRefs).toContain('nonexistent_field');
  });

  it('reports missed coverage when declared refs skip some card items', () => {
    const fields = { meaning_vi: ['a', 'b'], word_type: 'noun' };
    // Only cover one meaning, skip the other and word_type
    const result = validateExerciseRefs(fields, ['meaning_vi.0']);
    expect(result.missedRefs).toContain('meaning_vi.1');
    expect(result.missedRefs).toContain('word_type');
  });
});

describe('hasAnyFieldData', () => {
  it('returns false for null', () => {
    expect(hasAnyFieldData(null)).toBe(false);
  });

  it('returns false for empty object JSON', () => {
    expect(hasAnyFieldData('{}')).toBe(false);
  });

  it('returns true when at least one field has a non-empty string value', () => {
    expect(hasAnyFieldData(JSON.stringify({ meaning_vi: ['apple'] }))).toBe(true);
  });

  it('returns false when all values are empty/null', () => {
    expect(hasAnyFieldData(JSON.stringify({ meaning_vi: [], word_type: '' }))).toBe(false);
  });
});

describe('isValidRefFormat', () => {
  it('rejects empty string', () => {
    expect(isValidRefFormat('')).toBe(false);
  });

  it('accepts dotted path refs', () => {
    expect(isValidRefFormat('meaning_vi.0')).toBe(true);
    expect(isValidRefFormat('synonyms.2.value')).toBe(true);
  });

  it('accepts simple field names', () => {
    expect(isValidRefFormat('word_type')).toBe(true);
  });
});
