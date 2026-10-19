import { describe, expect, it } from 'vitest';
import {
  cleanText,
  countryToIso,
  expansionSource,
  findTemplates,
  flagToIso,
  parseExpandedParticipants,
  parseLeagueInfobox,
  parseParticipants,
  parsePlayerInfobox,
  parseTeamInfobox,
  parseTemplate,
  pickCoach,
  resolveIgl,
  squadImportSource,
  titleKey,
  type ParsedPlayer,
} from '../../../../scripts/liquipedia/parse.mjs';
import teamCardFixture from '../../../../scripts/liquipedia/__fixtures__/teamcard.wiki?raw';
import participantsFixture from '../../../../scripts/liquipedia/__fixtures__/teamparticipants.wiki?raw';
import expandedFixture from '../../../../scripts/liquipedia/__fixtures__/expanded.html?raw';

const handles = (players: ParsedPlayer[]) => players.map((p) => p.id);

describe('template parsing', () => {
  it('splits only top-level pipes and keeps nested templates/links intact', () => {
    const t = parseTemplate("{{TeamCard|team=A|p1=x|inotes={{NoteBig|n1=[[B|b]] {{player|y|flag=fi}}|date=2022}}|c=z}}");
    expect(t.name).toBe('TeamCard');
    expect(t.params.team).toBe('A');
    expect(t.params.c).toBe('z');
    expect(t.params.date).toBeUndefined();
    expect(t.params.inotes).toContain('{{player|y|flag=fi}}');
  });

  it('finds TeamCard but not "TeamCard columns start"', () => {
    expect(findTemplates('{{TeamCard columns start|cols=4}}\n{{TeamCard\n|team=A\n}}', 'TeamCard')).toEqual(['{{TeamCard\n|team=A\n}}']);
  });

  it('cleans markup', () => {
    expect(cleanText("<span style=\"x\">Dragon Ranger Gaming</span>")).toBe('Dragon Ranger Gaming');
    expect(cleanText("'''[[Fnatic|FNC]]'''&nbsp;2022")).toBe('FNC 2022');
  });

  it('maps Liquipedia flags and country names to ISO alpha-2', () => {
    expect(flagToIso('uk')).toBe('GB');
    expect(flagToIso('br')).toBe('BR');
    expect(flagToIso('usca')).toBeNull();
    expect(countryToIso('France')).toBe('FR');
    expect(countryToIso('Turkey')).toBe('TR');
    expect(countryToIso('South Korea')).toBe('KR');
    expect(countryToIso('xx')).toBeNull();
  });

  it('normalizes page titles', () => {
    expect(titleKey('mini_(British coach)')).toBe('Mini (British coach)');
  });
});

describe('TeamCard (Masters Reykjavík 2022)', () => {
  const parsed = parseParticipants(teamCardFixture);

  it('reads every team and sets withdrawn teams apart', () => {
    expect(parsed.format).toBe('TeamCard');
    expect(parsed.needsExpansion).toBe(false);
    expect(parsed.teams.map((t) => t.name)).toEqual(['Fnatic', 'Team Liquid', 'DRX', 'Paper Rex', 'OpTic Gaming']);
    expect(parsed.withdrawn).toEqual(['FunPlus Phoenix']);
  });

  it('reads players, substitutes, links and DNP', () => {
    const fnc = parsed.teams[0]!;
    expect(handles(fnc.players)).toEqual(['Boaster', 'Magnum', 'Mistic', 'H1ber', 'Fearoth', 'otom']);
    expect(fnc.players.filter((p) => p.isSub).map((p) => p.id)).toEqual(['otom']);
    expect(fnc.players.find((p) => p.id === 'otom')?.dnp).toBe(true);
    const prx = parsed.teams[3]!;
    expect(prx.players[0]).toMatchObject({ id: 'mindfreak', link: 'mindfreak (Indonesian player)', isSub: false });
  });

  it('reads the coach from c / clink, c2.. and staff tabs', () => {
    const [fnc, tl, drx, , optic] = parsed.teams;
    expect(pickCoach(fnc!.staff)).toMatchObject({ name: 'mini', link: 'Mini (British coach)' });
    expect(tl!.staff).toEqual([
      { name: 'Sliggy', link: 'Sliggy', flag: null, role: 'coach' },
      { name: 'Bacon9', link: 'Bacon9', flag: null, role: 'analyst' },
    ]);
    expect(pickCoach(tl!.staff)?.name).toBe('Sliggy');
    expect(drx!.staff.map((s) => s.name)).toEqual(['termi', 'Argency', 'glow']);
    expect(pickCoach(drx!.staff)?.name).toBe('termi');
    expect(pickCoach(optic!.staff)).toMatchObject({ name: 'Chet', link: 'Chet (American coach)' });
  });

  it('reads tNc (no index) and tab substitutes on withdrawn cards too', () => {
    const all = parseParticipants(teamCardFixture.replace('Former Participants', 'Participants'));
    const fpx = all.teams.find((t) => t.name === 'FunPlus Phoenix')!;
    expect(fpx.players.find((p) => p.id === 'baddyG')?.isSub).toBe(true);
    expect(pickCoach(fpx.staff)?.name).toBe('d00mbr0s');
  });

  it('reads the league infobox', () => {
    expect(parseLeagueInfobox(teamCardFixture)).toEqual({
      name: 'VALORANT Masters Reykjavík 2022',
      startDate: '2022-04-10',
      endDate: '2022-04-24',
      vlrId: null,
      teamNumber: 12,
    });
  });
});

describe('TeamParticipants (Champions 2026)', () => {
  const parsed = parseParticipants(participantsFixture);

  it('reads opponents, captains, subs, links and staff roles', () => {
    expect(parsed.format).toBe('TeamParticipants');
    expect(parsed.teams.map((t) => t.name)).toEqual(['100 Thieves', 'TYLOO', 'Global Esports', 'FURIA']);
    const [t100, tyloo, ge] = parsed.teams;
    expect(t100!.players.filter((p) => p.captain).map((p) => p.id)).toEqual(['vora']);
    expect(t100!.staff.map((s) => [s.name, s.role])).toEqual([
      ['Nbs', 'head coach'],
      ['d00mbr0s', 'assistant coach'],
      ['Kaimera', 'analyst'],
    ]);
    expect(tyloo!.players.find((p) => p.id === 'xihe')).toMatchObject({ isSub: true, dnp: true, flag: 'cn' });
    expect(ge!.players.find((p) => p.id === 'autumn')?.link).toBe('autumn (Australian player)');
    expect(pickCoach(ge!.staff)).toMatchObject({ name: 'Platoon', link: 'Platoon (Canadian coach)' });
  });

  it('flags imported rosters (players missing from the wikitext)', () => {
    const furia = parsed.teams[3]!;
    expect(furia.imported).toBe(true);
    expect(furia.players.filter((p) => !p.isSub)).toHaveLength(0);
    expect(parsed.needsExpansion).toBe(true);
    const src = expansionSource(participantsFixture);
    expect(src.startsWith('{{Infobox league')).toBe(true);
    expect(src).toContain('{{Opponent|FURIA|import=true');
  });

  it('builds the squad-import request with the league context', () => {
    const src = squadImportSource(participantsFixture, ['Fnatic', 'LOUD']);
    expect(src).toContain('|edate=2026-10-18');
    expect(src).toContain('|{{Opponent|Fnatic|import=true}}\n|{{Opponent|LOUD|import=true}}');
  });
});

describe('expanded TeamParticipants (imported rosters)', () => {
  const teams = parseExpandedParticipants(expandedFixture);

  it('reads main roster, subs, captain and staff from the rendered card', () => {
    expect(teams.map((t) => t.name)).toEqual(['FURIA', 'Nongshim RedForce']);
    const furia = teams[0]!;
    expect(furia.players.filter((p) => !p.isSub).map((p) => p.id)).toEqual(['nerve', 'koalanoob', 'eeiu', 'artzin', 'alym']);
    expect(furia.players.find((p) => p.captain)?.id).toBe('artzin');
    expect(furia.players.find((p) => p.id === 'basic')).toMatchObject({ isSub: true, dnp: true, flag: 'br' });
    expect(furia.players.find((p) => p.id === 'alym')).toMatchObject({ link: 'Alym', flag: 'kg' });
    expect(pickCoach(furia.staff)).toMatchObject({ name: 'shaW', link: 'ShaW', role: 'head coach' });
  });

  it('handles cards without a Subs tab', () => {
    const ns = teams[1]!;
    expect(ns.players.every((p) => !p.isSub)).toBe(true);
    expect(ns.players.find((p) => p.id === 'Ivy')?.link).toBe('Ivy (Korean player)');
    expect(pickCoach(ns.staff)?.name).toBe('SilKanoN');
  });
});

describe('infoboxes', () => {
  it('reads player country, roles and VLR id', () => {
    const info = parsePlayerInfobox('{{Infobox player\n|id=Boaster\n|country=United Kingdom\n|roles=igl\n|vlr=438\n}}');
    expect(info).toMatchObject({ id: 'Boaster', flag: 'GB', roles: ['igl'], isIGL: true, vlrId: '438' });
    expect(parsePlayerInfobox('{{Infobox player\n|id=x\n|roles=duelist, IGL\n}}')?.isIGL).toBe(true);
    expect(parsePlayerInfobox('{{Infobox player\n|id=x\n|roles=controller\n}}')?.isIGL).toBe(false);
  });

  it('falls back to country2 when country is unknown (xx)', () => {
    expect(parsePlayerInfobox('{{Infobox player\n|id=Shao\n|country=xx\n|country2=Russia\n}}')?.flag).toBe('RU');
  });

  it('reads the team VLR id', () => {
    expect(parseTeamInfobox('{{Infobox team\n|name=Example Team\n|vlr=123\n}}')).toEqual({ name: 'Example Team', vlrId: '123' });
    expect(parseTeamInfobox('no infobox')).toBeNull();
  });
});

describe('resolveIgl', () => {
  const p = (id: string, extra: Partial<ParsedPlayer> = {}): ParsedPlayer => ({
    id,
    link: id,
    flag: null,
    isSub: false,
    dnp: false,
    captain: false,
    ...extra,
  });
  const none = () => undefined;

  it('prefers the event captain', () => {
    expect(resolveIgl([p('a'), p('b', { captain: true })], () => true)).toEqual({
      igl: 'b',
      iglSource: 'event-captain',
      candidates: [],
    });
  });

  it('then the squad captain at the event date', () => {
    expect(resolveIgl([p('a'), p('b')], () => true, (l) => l === 'a').iglSource).toBe('squad-captain');
    expect(resolveIgl([p('a'), p('b')], (l) => l === 'a', (l) => l === 'a').iglSource).toBe('squad-captain');
  });

  it('refuses to pick when the squad captain and the only infobox IGL differ', () => {
    expect(resolveIgl([p('a'), p('b')], (l) => l === 'b', (l) => l === 'a')).toEqual({
      igl: null,
      iglSource: 'conflict',
      candidates: ['a', 'b'],
    });
  });

  it('then a unique IGL among starters in player infoboxes (subs ignored)', () => {
    const r = resolveIgl([p('a'), p('b'), p('c', { isSub: true })], (l) => l !== 'a');
    expect(r).toEqual({ igl: 'b', iglSource: 'infobox-unique', candidates: [] });
  });

  it('never guesses when ambiguous or unknown', () => {
    expect(resolveIgl([p('a'), p('b')], () => true)).toEqual({
      igl: null,
      iglSource: 'infobox-ambiguous',
      candidates: ['a', 'b'],
    });
    expect(resolveIgl([p('a', { captain: true }), p('b', { captain: true })], none).iglSource).toBe('event-ambiguous');
    expect(resolveIgl([p('a'), p('b')], none)).toEqual({ igl: null, iglSource: 'none', candidates: [] });
  });
});
