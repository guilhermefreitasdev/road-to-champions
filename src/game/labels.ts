/**
 * Labels with no dependency on the card pool, so the UI shell can show them before the pool loads (the home page
 * renders while the real data is still being fetched). Re-exported by ./run.ts, which remains their public home.
 */
import type { DraftMode } from '../engine/draft';

export const MODE_LABELS: Record<DraftMode, string> = { classic: 'Draft clássico', ultimate: 'Ultimate Draft' };
