// Live aircraft feed.
//
// Several community ADS-B networks publish the same readsb/tar1090 JSON shape
// for "aircraft near this point", and all of them have gaps in coverage. We try
// them in order and normalise whatever comes back into one aircraft record.

import { distanceNm } from './geo.js';

const USER_AGENT = 'charlevoix-flight-tracker/1.0 (personal aircraft spotting)';
const REQUEST_TIMEOUT_MS = 12000;

/** Ground speed below this with no altitude reading means "parked/taxiing". */
export const GROUND_SPEED_KT = 40;

/**
 * Pull the aircraft list out of a response.
 *
 * An empty list means a quiet sky and is a perfectly good answer. A body with
 * no aircraft key at all means the source is not answering the way we expect,
 * so we return null and let the caller move to the next source.
 */
function parseAircraftList(body) {
  if (body && typeof body === 'object') {
    if ('ac' in body) return body.ac ?? [];
    if ('aircraft' in body) return body.aircraft ?? [];
  }
  return null;
}

export const SOURCES = {
  adsbfi: {
    label: 'adsb.fi',
    url: (lat, lon, nm) =>
      `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${Math.min(nm, 250)}`,
    parse: parseAircraftList,
  },
  adsblol: {
    label: 'adsb.lol',
    url: (lat, lon, nm) =>
      `https://api.adsb.lol/v2/point/${lat}/${lon}/${Math.min(nm, 250)}`,
    parse: parseAircraftList,
  },
  airplaneslive: {
    label: 'airplanes.live',
    url: (lat, lon, nm) =>
      `https://api.airplanes.live/v2/point/${lat}/${lon}/${Math.min(nm, 250)}`,
    parse: parseAircraftList,
    headers: (source) => (source.apiKey ? { auth: source.apiKey } : {}),
  },
};

/**
 * Normalise one raw feed entry.
 *
 * The feeds report altitude as a number of feet or the string "ground", and
 * omit any field the receiver did not hear. Anything missing stays null so the
 * UI can say "unknown" rather than inventing a value.
 */
export function normalizeAircraft(raw, sourceId) {
  if (!raw || typeof raw !== 'object') return null;
  const hex = String(raw.hex ?? raw.icao ?? '').trim().toLowerCase().replace(/^~/, '');
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!hex || lat === null || lon === null) return null;

  const rawAlt = raw.alt_baro ?? raw.altitude ?? null;
  const onGround = rawAlt === 'ground' || raw.ground === true;
  const altBaro = onGround ? 0 : num(rawAlt);

  return {
    hex,
    reg: str(raw.r ?? raw.reg ?? raw.registration),
    flight: str(raw.flight)?.trim() || null,
    typeCode: str(raw.t ?? raw.type_code),
    desc: str(raw.desc ?? raw.type_long),
    ownOp: str(raw.ownOp ?? raw.owner),
    year: num(raw.year),
    lat,
    lon,
    onGround,
    altBaroFt: altBaro,
    altGeomFt: num(raw.alt_geom),
    groundSpeedKt: num(raw.gs ?? raw.speed),
    trackDeg: num(raw.track ?? raw.heading),
    verticalRateFpm: num(raw.baro_rate ?? raw.geom_rate ?? raw.vert_rate),
    squawk: str(raw.squawk),
    emergency: str(raw.emergency) && raw.emergency !== 'none' ? String(raw.emergency) : null,
    category: str(raw.category),
    // Seconds since this position was last updated by the receiver network.
    seenPosSec: num(raw.seen_pos) ?? num(raw.seen) ?? 0,
    military: raw.dbFlags != null ? Boolean(Number(raw.dbFlags) & 1) : false,
    source: sourceId,
  };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export class AdsbClient {
  /**
   * @param {object} opts
   * @param {Array<{id: string, enabled: boolean, apiKey?: string}>} opts.sources
   * @param {Function} [opts.fetchImpl] injected for tests / demo mode
   */
  constructor({ sources, fetchImpl = fetchJson } = {}) {
    this.sources = (sources ?? []).filter((s) => s.enabled && SOURCES[s.id]);
    this.fetchImpl = fetchImpl;
    this.lastGoodSourceId = null;
    this.lastError = null;
  }

  /** Sources, most recently successful one first. */
  orderedSources() {
    const list = [...this.sources];
    const i = list.findIndex((s) => s.id === this.lastGoodSourceId);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
    return list;
  }

  /**
   * Aircraft within radiusNm of a point. Throws only if every source failed.
   * Results are filtered to the true circle (feeds can return a square) and
   * sorted nearest-first.
   */
  async aircraftNear(lat, lon, radiusNm) {
    const errors = [];
    for (const source of this.orderedSources()) {
      const def = SOURCES[source.id];
      try {
        const body = await this.fetchImpl(
          def.url(lat, lon, radiusNm),
          def.headers ? def.headers(source) : {},
        );
        const list = def.parse(body);
        if (!Array.isArray(list)) throw new Error('unrecognised response');
        const aircraft = list
          .map((raw) => normalizeAircraft(raw, source.id))
          .filter(Boolean)
          .map((ac) => ({ ...ac, distanceFromCenterNm: distanceNm(lat, lon, ac.lat, ac.lon) }))
          .filter((ac) => ac.distanceFromCenterNm <= radiusNm)
          .sort((a, b) => a.distanceFromCenterNm - b.distanceFromCenterNm);
        this.lastGoodSourceId = source.id;
        this.lastError = null;
        return { aircraft, source: source.id, sourceLabel: def.label, fetchedAt: Date.now() };
      } catch (err) {
        errors.push(`${def.label}: ${err.message}`);
      }
    }
    this.lastError = errors.join('; ') || 'no data sources enabled';
    throw new Error(`No aircraft data available (${this.lastError})`);
  }
}
