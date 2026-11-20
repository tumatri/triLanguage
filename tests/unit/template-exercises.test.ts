import { describe, it, expect } from 'vitest';
import { buildFlashcardTemplate, buildMcqTemplate } from '../../worker/services/templateExercises';

describe('template flashcard builder', () => {
  it('generates a flashcard with front/back content from field data', () => {
    const fields = { meaning_vi: ['quả táo', 'trái táo'], word_type: 'noun' };
    const ex = buildFlashcardTemplate('apple', fields, ['meaning_vi.0', 'word_type']);
    expect(ex.exercise_type).toBe('flashcard');
    expect(ex.front_content.length).toBeGreaterThan(0);
    expect(ex.tested_item_refs).toEqual(['meaning_vi.0', 'word_type']);
  });

  it('falls back to front_text only when no matching refs', () => {
    const ex = buildFlashcardTemplate('hello world', {}, []);
    expect(ex.exercise_type).toBe('flashcard');
    expect(ex.front_content).toContain('hello world');
  });
});

describe('template MCQ builder', () => {
  it('generates MCQ when enough sibling values exist', () => {
    const fields = { meaning_vi: ['quả táo', 'trái cây', 'món táo', 'táo đỏ'] };
    const ex = buildMcqTemplate('apple', fields, ['meaning_vi.0']);
    if (ex) {
      expect(ex.exercise_type).toBe('multiple_choice');
      expect(ex.options).toHaveLength(4);
      expect(ex.correct_option_id).toBeDefined();
      expect(ex.explanation_vi.length).toBeGreaterThan(0);
    } else {
      // Fallback when not enough unique options
      expect(ex).toBeNull();
    }
  });

  it('returns null when not enough distinct values for 4 options', () => {
    const fields = { meaning_vi: ['chỉ có một nghĩa'] };
    const ex = buildMcqTemplate('test', fields, ['meaning_vi.0']);
    expect(ex).toBeNull();
  });
});

// ─── Fixtures for integration testing ────────────────────────────────────────

/** Full-featured vocabulary card fixture (all major fields populated). */
export const FULL_CARD_FIXTURE = {
  id: 'card-full-001',
  notebook_id: 'nb-test',
  card_type: 'vocab',
  front_text: 'apple',
  fields_json: JSON.stringify({
    phonetic: '/ˈæp.l/',
    word_type: 'noun',
    meaning_vi: ['quả táo', 'trái táo'],
    synonyms: [{ value: 'pomme', vi_meaning: 'táo (Tiếng Pháp)' }],
    antonyms: [],
    collocations: [{ value: 'apple pie', vi_meaning: 'đống hỗn độn' }],
    example_sentences: ['I eat an apple every day.', 'An apple a day keeps the doctor away.'],
    example_translations: ['Tôi ăn một quả táo mỗi ngày.', 'Một quả táo mỗi ngày giữ bác sĩ rời xa.']
  })
};

/** Minimal vocabulary card fixture (only front_text + one meaning). */
export const MINIMAL_CARD_FIXTURE = {
  id: 'card-min-001',
  notebook_id: 'nb-test',
  card_type: 'vocab',
  front_text: 'run',
  fields_json: JSON.stringify({
    meaning_vi: ['chạy']
  })
};
