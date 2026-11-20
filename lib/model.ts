// The token radar's model: one sealed snapshot in, one ranked board and its dashboard data out.
//
// A protocol's launch is the token it may issue one day. This model asks what a token would be worth if
// the protocol's record stayed as it is, using only the snapshot's own figures. No protocol name is
// special-cased: one function scores every row.
//
//   sector     = SECTOR_MULTIPLE[category] ?? DEFAULT_MULTIPLE      what a token of the sector is worth per $ of TVL
//   base       = tvl_usd * sector
//   growth     = clamp(change_7d ?? 0, -50, 80) per cent
//   growthMult = 1 + (growth / 100) * GROWTH_WEIGHT
//   maturity   = 0.85 + min(age_days, 1460) / 1460 * 0.30           a record that has run without a token counts
//   reach      = 1 + (min(chains, 4) - 1) * 0.03                    a protocol counted on more chains has more surface
//   implied    = max(1, round(base * growthMult * maturity * reach))
//
// Age is the UTC days from listed_at to the snapshot's as_of; a null listed_at is scored at
// UNKNOWN_AGE_DAYS. A protocol recording no token is pre-token: no mcap_usd, no gecko_id, no symbol.
// Live-token protocols are kept in their own list, at the market's own values, never ranked with these.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-2 sector-weighted';

export const MODEL = {
  default_multiple: 0.16,
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 80,
  maturity_floor: 0.85,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  reach_step: 0.03,
  reach_cap: 4,
} as const;

/** What a token of a sector is worth per dollar of its TVL. Stated on the page, editable in one place. */
export const SECTOR_MULTIPLE: Record<string, number> = {
  Dexs: 0.2,
  'Perp Dexs': 0.34,
  Derivatives: 0.26,
  Options: 0.24,
  Synthetics: 0.26,
  Lending: 0.24,
  CDP: 0.26,
  'Algo-Stables': 0.26,
  'Yield': 0.15,
  'Yield Aggregator': 0.13,
  'Liquid Staking': 0.14,
  'Liquid Restaking': 0.16,
  Restaking: 0.16,
  'Staking Pool': 0.13,
  Bridge: 0.11,
  'Canonical Bridge': 0.1,
  RWA: 0.3,
  'Prediction Market': 0.22,
  'Launchpad': 0.2,
  'Telegram Bot': 0.22,
  'Trading App': 0.24,
  Chain: 0.36,
  Rollup: 0.28,
  'Basis Trading': 0.12,
  Insurance: 0.18,
  Indexes: 0.14,
  'Onchain Capital Allocator': 0.14,
  MEV: 0.14,
  Gaming: 0.18,
  'NFT Marketplace': 0.16,
  Social: 0.12,
};

/** How many rows the board carries: the watchlist, then the pre-token protocols below the floor. */
export const BOARD_ROWS = 200;

/** How many live-token protocols the page's second view carries, by market cap. */
export const LIVE_ROWS = 30;

export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

export interface Scored {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  parts: { sector: number; base: number; growth: number; growth_mult: number; maturity_mult: number; reach_mult: number };
  farm_steps: FarmStep[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  symbol: string | null;
  mcap_over_tvl: number;
}

export interface Board {
  rows: Scored[];
  live: LiveRow[];
  early_size: number;
  live_size: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Whole UTC days from a YYYY-MM-DD day to another; null when a side is missing or unreadable. */
export function daysBetween(from: string | null, to: string): number | null {
  if (from === null) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export const isPreToken = (p: SnapshotProtocol): boolean =>
  p.mcap_usd === null && p.gecko_id === null && p.symbol === null;

/** The product types the snapshot's own watchlist rule leaves out: no token of their own to wait for. */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** A protocol the radar may rank: records no token and is not a wrapped, staked or bridged product. */
export function isRadarCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!raw || typeof raw !== 'object') throw new Error('snapshot is not an object');
  if (typeof raw.as_of !== 'string' || !Array.isArray(raw.protocols)) throw new Error('snapshot has no as_of or protocols');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot has no watchlist');
  if (typeof raw.floor_usd !== 'number' || raw.floor_usd <= 0) throw new Error('snapshot has no floor_usd');
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.tvl_usd !== 'number' || !Array.isArray(p.chains)) {
      throw new Error(`snapshot protocol ${JSON.stringify(p?.slug)} is malformed`);
    }
  }
  return raw;
}

/** The model's arithmetic for one protocol, in the order the page states it. */
export function score(p: SnapshotProtocol, asOf: string): { implied: number; parts: Scored['parts']; age_days: number | null } {
  const sector = p.category !== null && p.category in SECTOR_MULTIPLE ? SECTOR_MULTIPLE[p.category]! : MODEL.default_multiple;
  const base = p.tvl_usd * sector;
  const growth = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  const growthMult = 1 + (growth / 100) * MODEL.growth_weight;
  const age = daysBetween(p.listed_at, asOf);
  const known = age ?? MODEL.unknown_age_days;
  const maturity = MODEL.maturity_floor + (Math.min(known, MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const reach = 1 + (Math.min(Math.max(p.chains.length, 1), MODEL.reach_cap) - 1) * MODEL.reach_step;
  const implied = Math.max(1, Math.round(base * growthMult * maturity * reach));
  return { implied, age_days: age, parts: { sector, base, growth, growth_mult: growthMult, maturity_mult: maturity, reach_mult: reach } };
}

/** How a reader farms this protocol before it issues a token: concrete, costed, timed. */
export function farmPlan(p: SnapshotProtocol, ageDays: number | null): FarmStep[] {
  const cat = p.category ?? '';
  const chain = p.chains[0] ?? 'its main chain';
  const more = p.chains.length > 1 ? ` (it counts TVL on ${p.chains.length} chains; ${chain} is the deepest)` : ` on ${chain}`;
  const steps: FarmStep[] = [];

  if (cat === 'Prediction Market') {
    steps.push({
      action: `Take positions in ${p.name}'s own markets${more}: the volume a venue measures is the trading it settles, so a market held to resolution counts for more than a swap in and out.`,
      cost: 'about $1-50 of notional plus $1-3 of gas per trade',
      time: '20-40 min to open, then hold to resolution',
    });
  } else if (/^(Dexs|Perp Dexs|Derivatives|Options|Synthetics)$/.test(cat)) {
    steps.push({
      action: `Provide liquidity to ${p.name}'s deepest pool${more}. Check the 24h volume-to-TVL ratio first: under 0.3 the fees are thin and you are farming a points program, not a yield.`,
      cost: 'about $3-15 of gas plus the position',
      time: '15-30 min to open, then leave it open',
    });
  } else if (/^(Lending|CDP|Algo-Stables)$/.test(cat)) {
    steps.push({
      action: `Supply a stablecoin to ${p.name}${more} and borrow against it at or under 50% loan-to-value, so a 30% drawdown does not liquidate you.`,
      cost: 'about $3-10 of gas plus the collateral',
      time: '10-20 min, then a weekly health-factor check',
    });
  } else if (/^(Liquid Staking|Liquid Restaking|Restaking|Staking Pool)$/.test(cat)) {
    steps.push({
      action: `Stake through ${p.name}${more} and keep the liquid receipt it mints: the receipt is the position a launch is likely to reward.`,
      cost: 'about $2-8 of gas plus the stake',
      time: '5-15 min, then hold through any snapshot date',
    });
  } else if (/Bridge$/.test(cat)) {
    steps.push({
      action: `Move real volume through ${p.name}'s own bridge${more} rather than a third-party route, so the transfer counts toward the TVL its record shows.`,
      cost: 'about $3-20 of gas and bridge fee per hop',
      time: '10-20 min per transfer',
    });
  } else if (cat === 'RWA') {
    steps.push({
      action: `Mint or buy ${p.name}'s receivable${more} and hold it across a distribution date, which is the point a real-world-asset position is measured on.`,
      cost: 'about $5-25 of gas plus the notional',
      time: '1-2 days to settle',
    });
  } else {
    steps.push({
      action: `Open ${p.name}'s main position${more} at a test size first: a deposit or a swap you can unwind, checked against the TVL its record shows.`,
      cost: 'about $3-15 of gas plus the position',
      time: '10-20 min',
    });
  }

  steps.push({
    action: `Repeat the action across separate weeks${ageDays !== null ? ` — its record is ${ageDays} days old and a launch snapshot usually counts sustained use, not one deposit` : ' — a launch snapshot usually counts sustained use, not one deposit'}. Keep the position open across any date the protocol announces.`,
    cost: 'position-dependent, gas each time',
    time: 'ongoing, 10 min per visit',
  });
  steps.push({
    action: `Write down the entry cost, the lock-up and the exit path before you size up. A pre-token position you cannot exit is a donation, and ${p.name} records no token, so nothing here is a claim that one is coming.`,
    cost: '$0',
    time: '5 min, once',
  });
  steps.push({
    action: `Watch ${p.name}'s TVL and seven-day change weekly: a fall of 30% or more before any launch is the signal to leave, whatever the plan said.`,
    cost: '$0',
    time: '5 min a week',
  });
  return steps;
}

const stepText = (s: FarmStep): string => `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.slice(0, 600);

/** The board: every watchlist protocol, then the largest pre-token protocols below the floor, ranked. */
export function buildRadar(snapshot: Snapshot): Board {
  const watch = new Set(snapshot.watchlist);
  const scored: Scored[] = [];
  const live: LiveRow[] = [];

  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      if (p.mcap_usd !== null && p.mcap_usd > 0) {
        live.push({
          slug: p.slug,
          name: p.name,
          category: p.category,
          chains: p.chains,
          tvl_usd: p.tvl_usd,
          change_7d: p.change_7d,
          mcap_usd: p.mcap_usd,
          symbol: p.symbol,
          mcap_over_tvl: p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : 0,
        });
      }
      continue;
    }
    if (!watch.has(p.slug) && !isRadarCandidate(p)) continue;
    const { implied, parts, age_days } = score(p, snapshot.as_of);
    scored.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days,
      on_watchlist: watch.has(p.slug),
      implied_value_usd: implied,
      parts,
      farm_steps: farmPlan(p, age_days),
    });
  }

  const ranked = scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  const keep = new Set<string>(snapshot.watchlist);
  for (const row of ranked) {
    if (keep.size >= BOARD_ROWS) break;
    keep.add(row.slug);
  }
  const rows = ranked.filter((r) => keep.has(r.slug)).slice(0, BOARD_ROWS);
  const early_size = rows.filter((r) => !r.on_watchlist).length;
  live.sort((a, b) => b.mcap_usd - a.mcap_usd);
  return { rows, live: live.slice(0, LIVE_ROWS), early_size, live_size: live.length };
}

/** What the gate refuses, checked in the order it reports it; null when the board is valid. */
export function boardIssue(rows: Scored[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows: the board needs 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const values: number[] = [];
  const ranks: number[] = [];
  for (const r of rows) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug}: implied_value_usd ${r.implied_value_usd} is not a positive whole number of dollars at most 100,000,000,000,000`;
    }
    values.push(r.implied_value_usd);
    ranks.push(r.implied_value_usd);
    const steps = r.farm_steps.map(stepText);
    if (steps.length < 3 || steps.length > 12) return `${r.slug}: ${steps.length} farm steps, the gate wants 3 to 12`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug}: a farm step is ${s.trim().length} characters`;
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `the board does not cover ${slug} from the watchlist`;
  const ordered = [...rows].sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.implied_value_usd > ordered[i - 1]!.implied_value_usd) return `${ordered[i]!.slug} sits above a more valuable row`;
  }
  if (new Set(values).size === 1 && values.length > 1) return 'every row has the same implied value, so the board ranks nothing';
  return null;
}

/** The page's data: one script, no network, read by dashboard/app.js. */
export function dataScript(board: Board, snapshot: Snapshot): string {
  const payload = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: { version: MODEL_VERSION, constants: MODEL, sectors: SECTOR_MULTIPLE },
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      rows: board.rows.length,
      early: board.early_size,
      live: board.live_size,
    },
    rows: board.rows.map((r) => ({
      rank: 0,
      slug: r.slug,
      name: r.name,
      cat: r.category,
      chains: r.chains,
      tvl: r.tvl_usd,
      ch7: r.change_7d,
      listed: r.listed_at,
      age: r.age_days,
      watch: r.on_watchlist,
      iv: r.implied_value_usd,
      parts: r.parts,
      steps: r.farm_steps.map((s) => [s.action, s.cost, s.time]),
    })),
    live: board.live.map((l) => ({ slug: l.slug, name: l.name, cat: l.category, chains: l.chains, tvl: l.tvl_usd, ch7: l.change_7d, mcap: l.mcap_usd, sym: l.symbol, mcapOverTvl: l.mcap_over_tvl })),
  };
  payload.rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

export const boardRows = (rows: Scored[]): Array<Record<string, unknown>> =>
  rows.map((r, i) => ({
    rank: i + 1,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    age_days: r.age_days,
    token_status: 'pre-token',
    on_watchlist: r.on_watchlist,
    implied_value_usd: r.implied_value_usd,
    model: r.parts,
    farm_steps: r.farm_steps.map(stepText),
  }));
