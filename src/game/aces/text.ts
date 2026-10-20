/**
 * Does a video title name the player? The rule behind `youtube.titleRevealsPlayer` in aces.json, written by
 * scripts/aces/build.mjs with the same function (the tests check both agree): a word of the title equal to the
 * handle or an alias (case- and accent-insensitive, leetspeak 0/1/3/4/5 folded to o/i/e/a/s), or, for names of 4+
 * letters, the name inside the title with spaces and punctuation removed ("LOUDaspas" names aspas).
 */
const fold = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's');

export function titleNamesPlayer(title: string, names: readonly string[]): boolean {
  const words = fold(title).split(/[^a-z0-9]+/).filter(Boolean);
  const squashed = words.join('');
  return names.some((n) => {
    const f = fold(n).replace(/[^a-z0-9]/g, '');
    return !!f && (words.includes(f) || (f.length >= 4 && squashed.includes(f)));
  });
}
