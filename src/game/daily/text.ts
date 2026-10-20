/**
 * Text matching for the Daily's typed answers: case-, accent- and punctuation-insensitive ("Sacy", "sacy",
 * "SACY " and "Šacy" are the same answer).
 */

/** Lowercase ASCII letters and digits only; a name with nothing left (all non-Latin) keeps its lowercase form. */
export function normalizeName(s: string): string {
  const folded = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase();
  const ascii = folded.replace(/[^a-z0-9]/g, '');
  return ascii || folded.replace(/\s+/g, '');
}

/** Ranks names for an autocomplete: prefix matches first, then substring matches; shorter names first. */
export function rankMatches<T>(query: string, items: readonly T[], nameOf: (t: T) => string, limit = 8): T[] {
  const q = normalizeName(query);
  if (!q) return [];
  const prefix: { t: T; n: string }[] = [];
  const inner: { t: T; n: string }[] = [];
  for (const t of items) {
    const n = normalizeName(nameOf(t));
    if (n.startsWith(q)) prefix.push({ t, n });
    else if (n.includes(q)) inner.push({ t, n });
  }
  const order = (a: { n: string }, b: { n: string }) => a.n.length - b.n.length || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0);
  return [...prefix.sort(order), ...inner.sort(order)].slice(0, limit).map((x) => x.t);
}
