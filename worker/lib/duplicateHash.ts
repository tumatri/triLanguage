// Normalize Latin text: NFKC, trim, lowercase, collapse whitespace, strip punctuation at end
export function normalizeLatinFront(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"())\]}>]+$/, '')
    .trim();
}

// Normalize CJK text: NFKC, trim, collapse whitespace; keep variant as-is
export function normalizeCJKFront(text: string, isJapaneseOrChinese: boolean): string {
  if (!isJapaneseOrChinese) {
    return normalizeLatinFront(text);
  }
  return text
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .trim();
}

// Determine if text is likely CJK (contains Han characters or Japanese kana)
function isLikelyCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF]/.test(text);
}

// Compute duplicate_hash = SHA-256(notebook_id | language_variant | card_type | normalized_front)
export async function computeDuplicateHash(
  notebookId: string,
  languageVariant: string,
  cardType: string,
  frontText: string
): Promise<string> {
  const encoder = new TextEncoder();
  const isCJK = isLikelyCJK(frontText);
  const normalized = isCJK
    ? normalizeCJKFront(frontText, true)
    : normalizeLatinFront(frontText);

  const raw = `${notebookId}|${languageVariant}|${cardType}|${normalized}`;
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return Buffer.from(buffer).toString('hex');
}
