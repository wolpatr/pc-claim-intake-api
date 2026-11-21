export const NOTE_THRESHOLD = 0.6;
export const SOURCE_THRESHOLD = 0.75;

export function stemToken(word) {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ss|us|is|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function normalizeEvidence(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(stemToken)
    .join(' ');
}

export function keywordCoverage(text, keywords = []) {
  const haystack = ` ${normalizeEvidence(text)} `;
  const list = (keywords || []).map((keyword) => normalizeEvidence(keyword)).filter(Boolean);
  if (!normalizeEvidence(text) || !list.length) return { matched: 0, total: list.length, value: 0 };
  let matched = 0;
  for (const keyword of list) {
    if (haystack.includes(` ${keyword} `)) matched += 1;
  }
  return { matched, total: list.length, value: matched / list.length };
}

export function criterionThreshold(type) {
  return type === 'notes' || type === 'diagnosis' ? NOTE_THRESHOLD : SOURCE_THRESHOLD;
}
