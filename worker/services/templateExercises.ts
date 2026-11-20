/**
 * Static template exercise builder — generates deterministic exercises from card field data
 * without calling AI. Used as fallback when AI quota is exceeded or MCQ generation fails.
 */

import type { FlashcardExercise, McqExercise } from '../schemas/exercises';

/**
 * Build a flashcard exercise from card field data and a set of item refs to test.
 * No AI call needed — content comes directly from confirmed card fields.
 */
export function buildFlashcardTemplate(
  frontText: string,
  fieldsJson: Record<string, unknown>,
  itemRefs: string[]
): FlashcardExercise {
  // Build front content based on which refs are being tested
  const parts: string[] = [];
  const backParts: string[] = [];

  for (const ref of itemRefs) {
    const value = getNestedValue(fieldsJson, ref);
    if (value === null || value === undefined) continue;

    const label = refToLabel(ref);
    if (typeof value === 'string') {
      parts.push(`${label}: ${value}`);
      // For back, we show what was asked so user can self-assess
      backParts.push(`Đã kiểm tra: ${label} = "${value.slice(0, 100)}"`);
    } else if (Array.isArray(value)) {
      const summary = value.map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join('、').slice(0, 200);
      parts.push(`${label}: [${summary}]`);
      backParts.push(`Đã kiểm tra: ${label} (array ${value.length} mục)`);
    }
  }

  // If no meaningful content extracted, fall back to front_text only
  if (parts.length === 0) {
    parts.push(frontText);
    backParts.push(`Từ/Câu: ${frontText}`);
  }

  const testedFieldRefs = itemRefs.map((ref) => extractFieldFromRef(ref));

  return {
    exercise_type: 'flashcard',
    front_content: parts.join('\n'),
    back_content: backParts.join('\n'),
    tested_field_refs: testedFieldRefs,
    tested_item_refs: itemRefs,
    media_refs: [],
    expected_content_refs: itemRefs,
    schema_version: '1'
  };
}

/**
 * Build a deterministic MCQ template from card field data.
 * Generates simple recall questions with plausible distractors from same-field siblings.
 * Returns null if there isn't enough data to make a credible question.
 */
export function buildMcqTemplate(
  frontText: string,
  fieldsJson: Record<string, unknown>,
  itemRefs: string[]
): McqExercise | null {
  // Find a field with multiple values we can use for distractors
  const targetRef = findBestTargetRef(itemRefs, fieldsJson);
  if (!targetRef) return null;

  const correctValue = getNestedValue(fieldsJson, targetRef);
  if (typeof correctValue !== 'string' || !correctValue.trim()) return null;

  // Generate distractors from sibling values in the same array field
  const genResult = generateOptionsFromCard(correctValue, fieldsJson, targetRef);
  if (!genResult) return null;
  const { options, question } = genResult;
  if (!options || options.length < 4) return null;

  const correctId = options[0].id; // first option is always correct

  return {
    exercise_type: 'multiple_choice',
    question,
    options,
    correct_option_id: correctId,
    explanation_vi: `Đáp án đúng là "${correctValue}". Các phương án khác là các nghĩa/cụm từ khác của cùng trường dữ liệu.`,
    tested_field_refs: [extractFieldFromRef(targetRef)],
    tested_item_refs: [targetRef],
    media_refs: [],
    schema_version: '1'
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? (current as unknown[])[parseInt(seg, 10)] : ((current as Record<string, unknown>)[seg]);
    if (current === undefined || current === null) return undefined;
  }
  return current;
}

function extractFieldFromRef(ref: string): string {
  // "meaning_vi.0" → "meaning_vi"; "synonyms.2.value" → "synonyms"
  const parts = ref.split('.');
  return parts[0];
}

function refToLabel(ref: string): string {
  const map: Record<string, string> = {
    phonetic: 'Phiên âm',
    word_type: 'Từ loại',
    meaning_vi: 'Nghĩa tiếng Việt',
    synonyms: 'Đồng nghĩa',
    antonyms: 'Trái nghĩa',
    collocations: 'Collocation',
    example_sentences: 'Câu ví dụ',
    example_translations: 'Dịch câu ví dụ',
    example_phonetics: 'Phiên âm câu ví dụ'
  };
  const field = extractFieldFromRef(ref);
  return map[field] ?? field;
}

function findBestTargetRef(refs: string[], fieldsJson: Record<string, unknown>): string | null {
  // Prefer meaning_vi (core), then synonyms/0.value, etc.
  for (const candidate of ['meaning_vi.0', 'word_type', 'synonyms.0.value', 'collocations.0.value']) {
    const val = getNestedValue(fieldsJson, candidate);
    if (val && typeof val === 'string' && val.trim()) {
      // Check it's within our declared refs or is a parent
      const isCovered = refs.some((r) => r === candidate || r.startsWith(candidate.split('.')[0] + '.'));
      if (isCovered || candidate === 'word_type') return candidate;
    }
  }
  return null;
}

function generateOptionsFromCard(
  correctValue: string,
  fieldsJson: Record<string, unknown>,
  targetRef: string
): { options: Array<{ id: string; text: string }>; question: string } | null {
  const field = extractFieldFromRef(targetRef);
  const allValues = getAllStringValues(fieldsJson, field);

  // Deduplicate and ensure correctValue is included
  const candidates = [...new Set([correctValue, ...allValues])];
  if (candidates.length < 4) return null;

  // Shuffle and pick 3 distractors
  const shuffled = candidates.filter((v) => v !== correctValue);
  const distractors = shuffleArray(shuffled).slice(0, 3);
  const options = [
    { id: 'opt_a', text: correctValue },
    { id: 'opt_b', text: distractors[0] ?? '' },
    { id: 'opt_c', text: distractors[1] ?? '' },
    { id: 'opt_d', text: distractors[2] ?? '' }
  ].filter((o) => o.text.trim().length > 0);

  if (options.length < 4) return null;

  const label = refToLabel(targetRef);
  const question = `Trường ${label} của thẻ này là gì?`;

  return { options, question };
}

function getAllStringValues(obj: Record<string, unknown>, fieldName: string): string[] {
  const val = obj[fieldName];
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return String((record as Record<string, unknown>)['value'] ?? (record as Record<string, unknown>)['vi_meaning'] ?? '');
      }
      return '';
    })
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
