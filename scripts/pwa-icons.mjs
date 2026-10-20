// Generates the app icons (PWA manifest, favicon, Apple touch icon) from the Road to Champions emblem
// (src/ui/components/Emblem.tsx), with sharp. Output in public/icons/ and public/favicon.svg; commit the result.
//
//   npm run icons
//
// The emblem's "RTC" uses Barlow Condensed (the UI's display font). sharp renders SVG text with fontconfig, so the
// script downloads the font once (Google Fonts, OFL) into .cache/fonts/ and points fontconfig at it; without network
// it falls back to the system's sans-serif.
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/icons');
const fontDir = path.join(root, '.cache/fonts');

// Palette tokens (src/ui/styles.css :root).
const BG = '#0f1923';
const ACCENT = '#ff4655';
const TEXT = '#ece8e1';

/** The emblem (viewBox 64×72) with literal colors, as an SVG group placed at (x, y) with the given height. */
function emblem(x, y, height, fonts = "'Barlow Condensed', 'Arial Narrow', sans-serif") {
  const scale = height / 72;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M32 3l26 9v22c0 18-12 29-26 35C18 63 6 52 6 34V12z" fill="rgba(15,25,35,0.85)" stroke="${ACCENT}" stroke-width="3"/>
    <path d="M32 10l19 6.6V34c0 13.6-8.6 22.4-19 27.4C21.6 56.4 13 47.6 13 34V16.6z" fill="none" stroke="${TEXT}" stroke-opacity="0.35" stroke-width="1.5"/>
    <path d="M20 52l12-8 12 8" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linejoin="round"/>
    <text x="32" y="38" text-anchor="middle" fill="${TEXT}" font-family="${fonts}" font-style="italic" font-weight="900" font-size="19" letter-spacing="0.5">RTC</text>
  </g>`;
}

/**
 * A square icon: dark background (rounded unless full-bleed) with the emblem centred at `fill` of the height.
 * Maskable icons are full-bleed with the emblem inside the 80% safe zone.
 */
function iconSvg(size, { fill, radius }) {
  const h = size * fill;
  const w = (h * 64) / 72;
  const glow = `<radialGradient id="g" cx="50%" cy="100%" r="75%"><stop offset="0" stop-color="${ACCENT}" stop-opacity="0.28"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${glow}</defs>
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BG}"/>
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="url(#g)"/>
  ${emblem((size - w) / 2, (size - h) / 2, h, "'Barlow Condensed Black', 'Barlow Condensed', sans-serif")}
</svg>`;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Barlow Condensed 900 italic in .cache/fonts/, plus a fonts.conf that adds it to the system fonts. */
async function setupFont() {
  await mkdir(fontDir, { recursive: true });
  const ttf = path.join(fontDir, 'BarlowCondensed-BlackItalic.ttf');
  if (!(await exists(ttf))) {
    try {
      // An old user agent gets TrueType instead of WOFF2 (fontconfig reads TTF).
      const css = await (await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,900', { headers: { 'user-agent': 'Mozilla/4.0' } })).text();
      const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) throw new Error('no TTF in the font CSS');
      await writeFile(ttf, Buffer.from(await (await fetch(url)).arrayBuffer()));
    } catch (e) {
      console.warn(`Barlow Condensed unavailable (${e.message}); using the system sans-serif.`);
      return;
    }
  }
  const conf = path.join(fontDir, 'fonts.conf');
  await writeFile(
    conf,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>${fontDir}</dir><cachedir>${path.join(fontDir, 'cache')}</cachedir></fontconfig>`,
  );
  process.env.FONTCONFIG_FILE = conf;
}

await setupFont();
// Imported after FONTCONFIG_FILE is set: fontconfig reads it when the library loads.
const { default: sharp } = await import('sharp');

await mkdir(outDir, { recursive: true });
const icons = [
  { file: 'icon-192.png', size: 192, fill: 0.72, radius: 0.22 },
  { file: 'icon-512.png', size: 512, fill: 0.72, radius: 0.22 },
  { file: 'icon-maskable-192.png', size: 192, fill: 0.56, radius: 0 },
  { file: 'icon-maskable-512.png', size: 512, fill: 0.56, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, fill: 0.68, radius: 0 },
  { file: 'favicon-32.png', size: 32, fill: 0.9, radius: 0.18 },
];
for (const icon of icons) {
  const png = await sharp(Buffer.from(iconSvg(icon.size, icon))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(outDir, icon.file), png);
  console.log(`public/icons/${icon.file} (${png.length} B)`);
}

// Scalable favicon: just the emblem (browsers render its text with the system fonts).
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72">${emblem(0, 0, 72)}</svg>\n`;
await writeFile(path.join(root, 'public/favicon.svg'), favicon);
console.log('public/favicon.svg');
