// Pure wikitext parsers for Liquipedia (VALORANT wiki). No I/O: everything here is unit tested
// (src/data/real/liquipedia/parse.test.ts) against trimmed fixtures in scripts/liquipedia/__fixtures__/.
//
// Formats handled:
//   - {{TeamCard ...}}           event pages 2021–2025 (p1..pN, s1..sN, c/c2, tabs tNtitle/tNpM/tNcM)
//   - {{TeamParticipants ...}}   newer pages (2025+): {{Opponent|Team|players={{Persons|{{Person|id|role=..}}}}}}
//   - expanded TeamParticipants  HTML+wikilinks returned by action=expandtemplates, needed when an
//                                opponent has import=true (roster lives in Liquipedia's database)
//   - {{Infobox player}}, {{Infobox team}}, {{Infobox league}}

/** Index just past the template/link that opens at `start` ("{{" or "[["), or -1 if unbalanced. */
function skipBalanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; ) {
    const two = text.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i += 2;
    } else if (two === '}}' || two === ']]') {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return -1;
}

/** Removes HTML comments (they can hide whole params). */
export const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

/** All top-level-or-nested occurrences of {{name ...}} (exact name, case-insensitive first letter). */
export function findTemplates(text, name) {
  const out = [];
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\{\\{\\s*${esc}\\s*(?=\\||\\}\\}|\\n)`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const end = skipBalanced(text, m.index);
    if (end < 0) break;
    out.push(text.slice(m.index, end));
    re.lastIndex = end;
  }
  return out;
}

/** Splits a template body on "|" at depth 0 (ignoring pipes inside nested {{ }} and [[ ]]). */
function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += inner[i];
    }
  }
  parts.push(cur);
  return parts;
}

/** {{Name|a|k=v}} -> { name, args: ['a'], params: { k: 'v' } }. Values are trimmed. */
export function parseTemplate(raw) {
  const inner = stripComments(raw).replace(/^\{\{/, '').replace(/\}\}$/, '');
  const [name, ...rest] = splitTopLevel(inner);
  const args = [];
  const params = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    // A "=" inside a nested template/link does not make a named param.
    const firstNested = part.search(/\{\{|\[\[/);
    if (eq > 0 && (firstNested < 0 || eq < firstNested)) {
      params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else {
      args.push(part.trim());
    }
  }
  return { name: name.trim(), args, params };
}

/** Plain text of a short wikitext value: no tags, bold/italics, links ([[a|b]] -> b), templates. */
export function cleanText(s) {
  if (!s) return '';
  return stripComments(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isTrue = (v) => /^(true|yes|y|1)$/i.test((v ?? '').trim());

// ---------------------------------------------------------------- flags / countries

/** Country names Liquipedia uses that differ from Intl's English region names. */
const COUNTRY_ALIASES = {
  'united kingdom': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  turkey: 'TR',
  'czech republic': 'CZ',
  'hong kong': 'HK',
  macau: 'MO',
  macao: 'MO',
  'bosnia and herzegovina': 'BA',
  'ivory coast': 'CI',
  "côte d'ivoire": 'CI',
  'north macedonia': 'MK',
  macedonia: 'MK',
  myanmar: 'MM',
  burma: 'MM',
  kosovo: 'XK',
  'south korea': 'KR',
  korea: 'KR',
  russia: 'RU',
  vietnam: 'VN',
  'viet nam': 'VN',
  taiwan: 'TW',
  'chinese taipei': 'TW',
  usa: 'US',
  'united states of america': 'US',
  palestine: 'PS',
  'saudi arabia': 'SA',
  'united arab emirates': 'AE',
};
/** Liquipedia flag codes that are not ISO 3166-1 alpha-2. */
const FLAG_ALIASES = { uk: 'GB', en: 'GB', england: 'GB', sct: 'GB', scotland: 'GB', wales: 'GB', kos: 'XK' };

/** Deprecated, exceptional or grouping region codes that Intl still names (e.g. FX "France"). */
const DEPRECATED_REGIONS = new Set(
  'AN BU CS DD DY FX HV NH QO RH SU TP UK VD YD YU ZR EU EZ UN ZZ XA XB AC CP DG EA IC TA'.split(' '),
);
let regionByName;
let regionCodes;
function regionNames() {
  if (regionByName) return regionByName;
  regionByName = new Map();
  regionCodes = new Set();
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const A = 'A'.charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      const name = dn.of(code);
      if (DEPRECATED_REGIONS.has(code) || regionByName.has(name?.toLowerCase())) continue;
      if (name && name !== code) {
        regionByName.set(name.toLowerCase(), code);
        regionCodes.add(code);
      }
    }
  }
  return regionByName;
}

const isIsoRegion = (code) => regionNames() && regionCodes.has(code);

/** Country name ("United Kingdom", "Brazil") -> ISO alpha-2 uppercase, or null. */
export function countryToIso(name) {
  const key = cleanText(name ?? '').toLowerCase();
  if (!key) return null;
  return COUNTRY_ALIASES[key] ?? regionNames().get(key) ?? null;
}

/** Liquipedia flag code ("br", "uk") or country name -> ISO alpha-2 uppercase, or null. */
export function flagToIso(flag) {
  const f = cleanText(flag ?? '').toLowerCase();
  if (!f) return null;
  if (FLAG_ALIASES[f]) return FLAG_ALIASES[f];
  if (/^[a-z]{2}$/.test(f) && isIsoRegion(f.toUpperCase())) return f.toUpperCase();
  return countryToIso(f);
}

// ---------------------------------------------------------------- staff

/** Normalized staff role: 'head coach', 'assistant coach', 'coach', 'analyst', ... (lowercase). */
export const normRole = (r) => cleanText(r ?? '').toLowerCase() || 'coach';

/** The team's coach: the head coach if marked, else the first staff member with a plain "coach" role. */
export function pickCoach(staff) {
  return (
    staff.find((s) => s.role === 'head coach') ??
    staff.find((s) => s.role === 'coach') ??
    null
  );
}

// ---------------------------------------------------------------- TeamCard

/**
 * One {{TeamCard}}. Returns
 * { name, link, players: [{ id, link, flag, isSub, dnp, captain }], staff: [{ name, link, flag, role }], imported }.
 * `link` is the page to look up (pNlink / clink when given), `flag` the raw Liquipedia flag code or null.
 */
export function parseTeamCard(raw) {
  const { params: p } = parseTemplate(raw);
  const players = [];
  const staff = [];
  const addPlayer = (prefix, isSub) => {
    const id = cleanText(p[prefix]);
    if (!id) return;
    players.push({
      id,
      link: cleanText(p[`${prefix}link`]) || id,
      flag: cleanText(p[`${prefix}flag`]) || null,
      isSub,
      dnp: isTrue(p[`${prefix}dnp`]),
      captain: false,
    });
  };
  const addStaff = (prefix, key) => {
    const name = cleanText(p[key]);
    if (!name) return;
    staff.push({
      name,
      link: cleanText(p[`${prefix}link`]) || name,
      flag: cleanText(p[`${prefix}flag`]) || null,
      role: normRole(p[`${prefix}pos`]),
    });
  };
  const numbered = (re) =>
    Object.keys(p)
      .map((k) => k.match(re))
      .filter(Boolean)
      .sort((a, b) => Number(a[1]) - Number(b[1]) || Number(a[2] ?? 0) - Number(b[2] ?? 0));

  for (const [k] of numbered(/^p(\d+)$/)) addPlayer(k, false);
  for (const [k] of numbered(/^s(\d+)$/)) addPlayer(k, true);
  // c, c1, c2 ... (c == c1)
  for (const [k] of numbered(/^c(\d*)$/)) addStaff(k, k);
  // Tabs: tNtitle with tNpM (extra players: substitutes) and tNcM / tNc (staff).
  for (const [k] of numbered(/^t(\d+)p(\d+)$/)) addPlayer(k, true);
  for (const [k] of numbered(/^t(\d+)c(\d*)$/)) addStaff(k, k);

  const name = cleanText(p.team);
  return { name, link: cleanText(p.link) || name, players, staff, imported: false };
}

// ---------------------------------------------------------------- TeamParticipants

/** {{Person|id|link=|flag=|role=|type=staff|status=sub|played=false}} */
function parsePerson(raw) {
  const { args, params } = parseTemplate(raw);
  const id = cleanText(args[0]);
  return { id, link: cleanText(params.link) || id, flag: cleanText(params.flag) || null, params };
}

/** One {{Opponent|Team|...|players={{Persons|...}}}} inside {{TeamParticipants}}. */
export function parseOpponent(raw) {
  const { args, params } = parseTemplate(raw);
  const name = cleanText(args[0]);
  const players = [];
  const staff = [];
  for (const personRaw of findTemplates(params.players ?? '', 'Person')) {
    const { id, link, flag, params: pp } = parsePerson(personRaw);
    if (!id) continue;
    const role = cleanText(pp.role).toLowerCase();
    if (/^staff$/i.test(pp.type ?? '')) {
      staff.push({ name: id, link, flag, role: normRole(pp.role) });
    } else {
      players.push({
        id,
        link,
        flag,
        isSub: /^sub/i.test(pp.status ?? ''),
        dnp: /^false$/i.test(pp.played ?? ''),
        captain: role === 'captain' || role === 'igl' || role === 'in-game leader',
      });
    }
  }
  return { name, link: cleanText(params.link) || name, players, staff, imported: isTrue(params.import) };
}

export function parseTeamParticipants(raw) {
  const { args } = parseTemplate(raw);
  return args.filter((a) => /^\{\{\s*Opponent\b/i.test(a)).map(parseOpponent);
}

/**
 * Teams of an event page. TeamCards win when present (older format); otherwise TeamParticipants.
 * Returns { format, teams, withdrawn, needsExpansion } — withdrawn lists teams under "Former Participants";
 * needsExpansion is true when some opponent's roster is
 * imported from Liquipedia's database (import=true) and therefore missing from the wikitext.
 */
export function parseParticipants(wikitext) {
  const text = stripComments(wikitext);
  const cards = findTemplates(text, 'TeamCard');
  if (cards.length) {
    // Teams that withdrew sit in a collapsed "Former Participants" wikitable: keep them apart.
    const formerRanges = [...text.matchAll(/Former Participants/gi)].map((m) => {
      const end = text.indexOf('\n|}', m.index);
      return [m.index, end < 0 ? text.length : end];
    });
    const isFormer = (raw) => {
      const at = text.indexOf(raw);
      return formerRanges.some(([a, b]) => at > a && at < b);
    };
    return {
      format: 'TeamCard',
      teams: cards.filter((c) => !isFormer(c)).map(parseTeamCard),
      withdrawn: cards.filter(isFormer).map((c) => parseTeamCard(c).name),
      needsExpansion: false,
    };
  }
  const teams = findTemplates(text, 'TeamParticipants').flatMap(parseTeamParticipants);
  return { format: 'TeamParticipants', teams, withdrawn: [], needsExpansion: teams.some((t) => t.imported) };
}

/** Wikitext to send to action=expandtemplates: the league infobox (sets the tournament context
 * the importer needs) followed by every {{TeamParticipants}} block of the page. */
export function expansionSource(wikitext) {
  const text = stripComments(wikitext);
  const infobox = findTemplates(text, 'Infobox league')[0] ?? '';
  return [infobox, ...findTemplates(text, 'TeamParticipants')].join('\n');
}

/**
 * Wikitext asking Liquipedia to import each team's squad at the event date (from its transfer/roster
 * database, which marks the team captain). Used only to read "Captain" markers; the event roster
 * itself always comes from the event page. Team order is preserved in the expanded output.
 */
export function squadImportSource(wikitext, teamLinks) {
  const infobox = findTemplates(stripComments(wikitext), 'Infobox league')[0] ?? '';
  return `${infobox}\n{{TeamParticipants\n${teamLinks.map((l) => `|{{Opponent|${l}|import=true}}`).join('\n')}\n}}`;
}

/** Page-title key for comparing links: underscores as spaces, first letter uppercase. */
export const titleKey = (t) => {
  const s = (t ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---------------------------------------------------------------- expanded TeamParticipants

const linkOf = (s) => {
  const m = s.match(/\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/);
  return m ? { link: m[1].trim(), text: (m[2] ?? m[1]).trim() } : null;
};

/**
 * Parses the output of expandtemplates for {{TeamParticipants}}: one card per team, with roster tabs
 * (Main / Subs / Staff) and a right-hand role label per member ("Captain", "DNP", "Head Coach", ...).
 * Same team shape as parseTeamCard; `flag` is the ISO-ish code from the flag file name (e.g. "br").
 */
export function parseExpandedParticipants(html) {
  const cards = html.split('class="team-participant-card__header"').slice(1);
  return cards.map((card) => {
    const full = card.split('team-participant-card__opponent-full')[1] ?? card;
    const team = linkOf(full.match(/<span class="name"[^>]*>(.*?)<\/span>/)?.[1] ?? '') ?? { link: '', text: '' };
    const labels = {};
    for (const m of card.matchAll(/data-toggle-area-btn="(\d+)"[^>]*>([^<]*)</g)) labels[m[1]] = m[2].trim().toLowerCase();
    const areas = card.split(/data-toggle-area-content="(\d+)"/);
    const players = [];
    const staff = [];
    // areas = [before, idx1, content1, idx2, content2, ...]; with no tabs everything is "main".
    const chunks = areas.length > 1 ? [] : [['main', card]];
    for (let i = 1; i < areas.length; i += 2) chunks.push([labels[areas[i]] ?? (areas[i] === '1' ? 'main' : ''), areas[i + 1]]);
    for (const [label, chunk] of chunks) {
      for (const member of chunk.split('team-participant-card__member"').slice(1)) {
        const flagFile = member.match(/<span class="flag">\[\[File:([^|\]]+)/)?.[1] ?? '';
        const nameHtml = member.match(/<span class="name"[^>]*>(.*?)<\/span>/)?.[1] ?? '';
        const who = linkOf(nameHtml);
        if (!who) continue; // "TBD" placeholders have no link
        const roleText = cleanText(member.match(/member-role-right">([^<]*)</)?.[1] ?? '');
        const flagCode = flagFile.match(/^([a-z]{2,3})_hd\./i)?.[1]?.toLowerCase() ?? null;
        if (label === 'staff') {
          staff.push({ name: who.text, link: who.link, flag: flagCode, role: normRole(roleText) });
        } else {
          players.push({
            id: who.text,
            link: who.link,
            flag: flagCode,
            isSub: label !== 'main',
            dnp: /^dnp$/i.test(roleText),
            captain: /^captain$/i.test(roleText),
          });
        }
      }
    }
    return { name: team.text, link: team.link, players, staff, imported: true };
  });
}

// ---------------------------------------------------------------- infoboxes

function infobox(wikitext, name) {
  const raw = findTemplates(stripComments(wikitext ?? ''), name)[0];
  return raw ? parseTemplate(raw).params : null;
}

/** Roles that mean "in-game leader" in a player infobox. */
const IGL_ROLES = new Set(['igl', 'in-game leader', 'ingame leader', 'in game leader']);

/** {{Infobox player}} -> { id, country, flag, roles, isIGL, vlrId, status } or null. */
export function parsePlayerInfobox(wikitext) {
  const p = infobox(wikitext, 'Infobox player');
  if (!p) return null;
  const roles = [p.roles, p.role, p.role2, p.role3]
    .filter(Boolean)
    .flatMap((r) => cleanText(r).split(/[,/;]/))
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  // country=xx means "unknown"; fall back to a second nationality when that one is known.
  const country = [p.country, p.country2, p.country3].map((c) => cleanText(c)).find((c) => countryToIso(c)) ?? null;
  return {
    id: cleanText(p.id) || null,
    country,
    flag: countryToIso(country),
    roles: [...new Set(roles)],
    isIGL: roles.some((r) => IGL_ROLES.has(r)),
    vlrId: cleanText(p.vlr) || null,
    status: cleanText(p.status) || null,
  };
}

/** {{Infobox team}} -> { name, vlrId } or null. */
export function parseTeamInfobox(wikitext) {
  const p = infobox(wikitext, 'Infobox team');
  if (!p) return null;
  return { name: cleanText(p.name) || null, vlrId: cleanText(p.vlr) || null };
}

/** {{Infobox league}} -> { name, startDate, endDate, vlrId, teamNumber } or null. */
export function parseLeagueInfobox(wikitext) {
  const p = infobox(wikitext, 'Infobox league');
  if (!p) return null;
  return {
    name: cleanText(p.name) || null,
    startDate: cleanText(p.sdate) || null,
    endDate: cleanText(p.edate) || null,
    vlrId: cleanText(p.vlr) || null,
    teamNumber: Number(cleanText(p.team_number)) || null,
  };
}

// ---------------------------------------------------------------- IGL

/**
 * Picks the team's in-game leader without guessing. Liquipedia marks the in-game leader as "Captain".
 *   1. 'event-captain'     exactly one player marked Captain on the event page (per event; most reliable)
 *   2. 'squad-captain'     exactly one starter marked Captain in the team's Liquipedia squad at the event
 *                          date (transfer/roster database, via import); per date, but sparse for old events
 *   3. 'infobox-unique'    exactly one starter whose player infobox lists the IGL role (career role, not per event)
 *      If the only infobox IGL is a different starter -> 'conflict', igl null, both listed.
 *   4. 'event-ambiguous' / 'infobox-ambiguous'  two or more candidates -> igl null, candidates listed
 *   5. 'none'              no signal -> igl null
 * `isIGLByLink(link)` returns true/false/undefined for a player page; `isSquadCaptain(link)` likewise.
 */
export function resolveIgl(players, isIGLByLink, isSquadCaptain = () => false) {
  const captains = players.filter((p) => p.captain);
  if (captains.length === 1) return { igl: captains[0].id, iglSource: 'event-captain', candidates: [] };
  if (captains.length > 1) return { igl: null, iglSource: 'event-ambiguous', candidates: captains.map((p) => p.id) };
  const starters = players.filter((p) => !p.isSub);
  const squad = starters.filter((p) => isSquadCaptain(p.link) === true);
  const marked = starters.filter((p) => isIGLByLink(p.link) === true);
  if (squad.length === 1) {
    // "Captain" is not always the caller: when the only infobox IGL is someone else, do not pick.
    if (marked.length === 1 && marked[0] !== squad[0]) {
      return { igl: null, iglSource: 'conflict', candidates: [squad[0].id, marked[0].id] };
    }
    return { igl: squad[0].id, iglSource: 'squad-captain', candidates: [] };
  }
  if (marked.length === 1) return { igl: marked[0].id, iglSource: 'infobox-unique', candidates: [] };
  if (marked.length > 1) return { igl: null, iglSource: 'infobox-ambiguous', candidates: marked.map((p) => p.id) };
  return { igl: null, iglSource: 'none', candidates: [] };
}
