/** Public URL of a path under public/ (honours Vite's base). Kept apart from ./media.ts so the UI shell can use it
 * without pulling in the media index. */
export function publicUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}
