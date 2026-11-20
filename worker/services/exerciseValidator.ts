/**
 * Exercise validator — verifies that AI-declared tested_field_refs / tested_item_refs
 * actually correspond to real data items in the card's fields_json.
 *
 * Server MUST NOT trust AI's claim; every ref is checked against ground-truth data.
 */

import { computeRequiredItemRefs } from './coverageEngine';

export interface ValidationResult {
  /** true iff all declared refs are grounded in real card data */
  valid: boolean;
  /** refs that passed validation */
  validRefs: string[];
  /** refs that were declared but have no corresponding data (forged/ungrounded) */
  invalidRefs: string[];
  /** refs present in card but not covered by this exercise (missed coverage) */
  missedRefs: string[];
}

/**
 * Validate an exercise's declared tested_item_refs against the card's actual field data.
 */
export function validateExerciseRefs(
  fieldsJson: Record<string, unknown>,
  declaredItemRefs: string[]
): ValidationResult {
  const requiredRefs = computeRequiredItemRefs(fieldsJson);
  const requiredRefSet = new Set(requiredRefs.map((r) => r.ref));

  const validRefs: string[] = [];
  const invalidRefs: string[] = [];

  for (const ref of declaredItemRefs) {
    // A ref is "valid" if it matches a known item path in the card
    if (requiredRefSet.has(ref)) {
      validRefs.push(ref);
    } else {
      // Could be a parent-path ref like "synonyms" that covers all synonym items
      const isParentPath = requiredRefs.some((r) => r.ref.startsWith(ref + '.'));
      if (isParentPath) {
        // Accept parent-path refs as valid (they imply covering children)
        validRefs.push(ref);
      } else {
        invalidRefs.push(ref);
      }
    }
  }

  // Missed refs: required refs not covered by any valid declaration
  const coveredByValid = new Set(validRefs.flatMap((ref) => {
    if (requiredRefSet.has(ref)) return [ref];
    // Parent path covers all children
    return requiredRefs.filter((r) => r.ref.startsWith(ref + '.')).map((r) => r.ref);
  }));

  const missedRefs = requiredRefs
    .filter((r) => !coveredByValid.has(r.ref))
    .map((r) => r.ref);

  return {
    valid: invalidRefs.length === 0,
    validRefs,
    invalidRefs,
    missedRefs
  };
}

/**
 * Determine whether a card has ANY storable field data (for deciding flashcard vs MCQ fallback).
 */
export function hasAnyFieldData(fieldsJson: string | null): boolean {
  if (!fieldsJson) return false;
  try {
    const parsed = JSON.parse(fieldsJson) as Record<string, unknown>;
    return Object.values(parsed).some((v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Check whether a reference looks like it could point to real card data (sanity check).
 * Rejects obviously bogus refs like "", "*", or non-dotted nonsense.
 */
export function isValidRefFormat(ref: string): boolean {
  if (!ref || ref.trim().length === 0) return false;
  // Must contain at least one alphanumeric segment
  return /[a-zA-Z0-9_]/.test(ref);
}
