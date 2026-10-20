import { describe, expect, it } from 'vitest';
import { createRun } from './run';
import { createSeason } from './season';
import { deserializeRun, deserializeSeason, serializeRun, serializeSeason } from './persist';

describe('save packing', () => {
  it('round-trips fresh states and accepts unpacked saves', () => {
    const run = createRun('classic', 'pk', 'hard');
    expect(deserializeRun(serializeRun(run))).toEqual(run);
    expect(deserializeRun(JSON.stringify(run))).toEqual(run);
    const season = createSeason('pk', 'legend', 'prime');
    expect(deserializeSeason(serializeSeason(season))).toEqual(season);
    expect(deserializeSeason(JSON.stringify(season))).toEqual(season);
  });

  it('rejects garbage and outdated saves', () => {
    expect(deserializeRun('not json')).toBeNull();
    expect(deserializeRun('null')).toBeNull();
    expect(deserializeRun(JSON.stringify({ ...createRun('classic', 'x'), version: 6 }))).toBeNull();
    expect(deserializeSeason(JSON.stringify({ ...createSeason('x'), version: 3 }))).toBeNull();
    expect(deserializeSeason('{"packedCards": 1}')).toBeNull();
  });
});
