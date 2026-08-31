/**
 * Zero-dependency fuzzy search & ranking utility for the SaviTools Command Palette.
 */

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
  matches: boolean;
}

/**
 * Calculates a match score for a candidate string against a search query.
 * Higher scores mean stronger matches. Returns 0 if there is no match.
 */
export function calculateFuzzyScore(target: string, query: string): number {
  if (!query || query.trim() === '') return 1;
  if (!target) return 0;

  const t = target.toLowerCase();
  const q = query.toLowerCase().trim();

  // 1. Exact match
  if (t === q) {
    return 1000;
  }

  // 2. Starts with query (prefix match)
  if (t.startsWith(q)) {
    return 800 + (100 / Math.max(1, t.length));
  }

  // 3. Contains full substring
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    // Bonus if substring starts at a word boundary (e.g. space, hyphen, slash, dot)
    const isWordBoundary =
      subIdx === 0 || /[\s\-_/.]/.test(t[subIdx - 1]);
    return (isWordBoundary ? 600 : 400) - subIdx;
  }

  // 4. Word initial / acronym match (e.g. "ce" matches "Contract Events")
  const words = t.split(/[\s\-_/.]+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('');
  if (initials.includes(q)) {
    return 500;
  }

  // 5. Sequential character matching (fuzzy sub-sequence)
  let qIdx = 0;
  let score = 0;
  let consecutiveCount = 0;
  let prevMatchIdx = -1;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      let charScore = 10;

      // Word boundary bonus
      if (i === 0 || /[\s\-_/.]/.test(t[i - 1])) {
        charScore += 25;
      }

      // Consecutive match bonus
      if (prevMatchIdx === i - 1) {
        consecutiveCount++;
        charScore += consecutiveCount * 15;
      } else {
        consecutiveCount = 0;
      }

      prevMatchIdx = i;
      score += charScore;
    }
  }

  // If not all query characters matched in sequence, it's not a match
  if (qIdx < q.length) {
    return 0;
  }

  // Penalize based on length difference
  const lengthPenalty = Math.max(0, t.length - q.length);
  return Math.max(1, score - lengthPenalty);
}

export const fuzzyScore = calculateFuzzyScore;

export interface SearchableFields<T> {
  getTexts: (item: T) => string[];
  getWeight?: (item: T, fieldIndex: number) => number;
}

export type SearchableFieldInput<T> =
  | SearchableFields<T>
  | ((item: T) => string | string[]);

/**
 * Filters and ranks a list of items using fuzzy search against multiple text fields.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  fields: SearchableFieldInput<T>,
): T[] {
  if (!query || query.trim() === '') {
    return items;
  }

  const getTexts =
    typeof fields === 'function'
      ? (item: T) => {
          const res = fields(item);
          return Array.isArray(res) ? res : [res];
        }
      : fields.getTexts;

  const getWeight =
    typeof fields === 'object' && fields.getWeight ? fields.getWeight : undefined;

  const scored: { item: T; maxScore: number }[] = [];

  for (const item of items) {
    const texts = getTexts(item);
    let maxScore = 0;

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) continue;
      const rawScore = calculateFuzzyScore(text, query);
      const weight = getWeight ? getWeight(item, i) : 1;
      const finalScore = rawScore * weight;
      if (finalScore > maxScore) {
        maxScore = finalScore;
      }
    }

    if (maxScore > 0) {
      scored.push({ item, maxScore });
    }
  }

  return scored
    .sort((a, b) => b.maxScore - a.maxScore)
    .map((s) => s.item);
}

