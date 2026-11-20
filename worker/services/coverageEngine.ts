/**
 * Coverage engine — computes required item refs from card field data.
 *
 * An "item ref" is a dotted path to a specific sub-value within fields_json.
 * Examples:
 *   - "meaning_vi.0"     → first Vietnamese meaning
 *   - "synonyms.2.value" → third synonym's word
 *   - "example_sentences.1" → second example sentence
 *
 * The engine walks fields_json and returns ALL item refs that have non-empty values.
 * These are the refs that MUST appear in at least one exercise within the coverage window.
 */

export interface ItemRef {
  /** Dotted path to the item, e.g. "meaning_vi.0" */
  ref: string;
  /** Human-readable label for display (first 60 chars) */
  label: string;
  /** Priority: 'core' for essential fields, 'secondary' for optional ones */
  priority: 'core' | 'secondary';
}

/**
 * Compute all item refs with actual data from a card's fields_json.
 */
export function computeRequiredItemRefs(fieldsJson: Record<string, unknown>): ItemRef[] {
  const refs: ItemRef[] = [];

  // Top-level scalar fields
  if (fieldsJson.phonetic && typeof fieldsJson.phonetic === 'string' && fieldsJson.phonetic.trim()) {
    refs.push({ ref: 'phonetic', label: fieldsJson.phonetic.slice(0, 60), priority: 'core' });
  }
  if (fieldsJson.word_type && typeof fieldsJson.word_type === 'string' && fieldsJson.word_type.trim()) {
    refs.push({ ref: 'word_type', label: fieldsJson.word_type.slice(0, 60), priority: 'core' });
  }

  // meaning_vi: array of strings
  if (Array.isArray(fieldsJson.meaning_vi)) {
    fieldsJson.meaning_vi.forEach((item, i) => {
      if (typeof item === 'string' && item.trim()) {
        refs.push({ ref: `meaning_vi.${i}`, label: item.slice(0, 60), priority: 'core' });
      }
    });
  }

  // synonyms: array of { value, vi_meaning?, variant? }
  if (Array.isArray(fieldsJson.synonyms)) {
    fieldsJson.synonyms.forEach((item, i) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (obj.value && typeof obj.value === 'string' && obj.value.trim()) {
          refs.push({ ref: `synonyms.${i}.value`, label: `${obj.value} (${String((obj as Record<string, unknown>)['vi_meaning'] ?? '')})`.slice(0, 60), priority: 'secondary' });
        }
        if (obj.vi_meaning && typeof obj.vi_meaning === 'string' && obj.vi_meaning.trim()) {
          refs.push({ ref: `synonyms.${i}.vi_meaning`, label: obj.vi_meaning.slice(0, 60), priority: 'secondary' });
        }
      }
    });
  }

  // antonyms: same structure as synonyms
  if (Array.isArray(fieldsJson.antonyms)) {
    fieldsJson.antonyms.forEach((item, i) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (obj.value && typeof obj.value === 'string' && obj.value.trim()) {
          refs.push({ ref: `antonyms.${i}.value`, label: `${obj.value} (${String((obj as Record<string, unknown>)['vi_meaning'] ?? '')})`.slice(0, 60), priority: 'secondary' });
        }
        if (obj.vi_meaning && typeof obj.vi_meaning === 'string' && obj.vi_meaning.trim()) {
          refs.push({ ref: `antonyms.${i}.vi_meaning`, label: obj.vi_meaning.slice(0, 60), priority: 'secondary' });
        }
      }
    });
  }

  // collocations: same structure
  if (Array.isArray(fieldsJson.collocations)) {
    fieldsJson.collocations.forEach((item, i) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (obj.value && typeof obj.value === 'string' && obj.value.trim()) {
          refs.push({ ref: `collocations.${i}.value`, label: `${obj.value} (${String((obj as Record<string, unknown>)['vi_meaning'] ?? '')})`.slice(0, 60), priority: 'secondary' });
        }
        if (obj.vi_meaning && typeof obj.vi_meaning === 'string' && obj.vi_meaning.trim()) {
          refs.push({ ref: `collocations.${i}.vi_meaning`, label: obj.vi_meaning.slice(0, 60), priority: 'secondary' });
        }
      }
    });
  }

  // example_sentences + translations (parallel arrays)
  const examples = Array.isArray(fieldsJson.example_sentences) ? fieldsJson.example_sentences : [];
  const translations = Array.isArray(fieldsJson.example_translations) ? fieldsJson.example_translations : [];
  examples.forEach((s, i) => {
    if (typeof s === 'string' && s.trim()) {
      refs.push({ ref: `example_sentences.${i}`, label: s.slice(0, 60), priority: 'secondary' });
      if (translations[i] && typeof translations[i] === 'string' && translations[i].trim()) {
        refs.push({ ref: `example_translations.${i}`, label: translations[i].slice(0, 60), priority: 'secondary' });
      }
    }
  });

  return refs;
}

/**
 * Compute which refs are NOT yet covered in the given session.
 * coveredThisSession: refs marked covered during this specific session run.
 * coveredInRecentWindow: refs marked covered in the last N sessions (configurable).
 */
export function getUncoveredRefs(
  requiredRefs: ItemRef[],
  coveredThisSession: string[],
  coveredInRecentWindow: string[]
): ItemRef[] {
  const coveredSet = new Set([...coveredThisSession, ...coveredInRecentWindow]);
  return requiredRefs.filter((r) => !coveredSet.has(r.ref));
}

/**
 * Get core refs (must be covered every session) vs secondary refs (rotated).
 */
export function partitionByPriority(refs: ItemRef[]): { core: ItemRef[]; secondary: ItemRef[] } {
  return {
    core: refs.filter((r) => r.priority === 'core'),
    secondary: refs.filter((r) => r.priority === 'secondary')
  };
}

/**
 * Maximum exercises per card per session (Appendix F.1).
 */
export const MAX_EXERCISES_PER_SESSION = 10;

/**
 * Session budget per level (proposed — pending owner approval per Architecture §7.3 table).
 */
export const SESSION_BUDGET_PER_LEVEL: Record<number, number> = {
  0: 10,
  1: 8,
  2: 7,
  3: 6,
  4: 5,
  5: 4,
  6: 3
};

export function getSessionBudget(masteryLevel: number): number {
  if (masteryLevel < 0 || masteryLevel > 6) return MAX_EXERCISES_PER_SESSION;
  return SESSION_BUDGET_PER_LEVEL[masteryLevel];
}
