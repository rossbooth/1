import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

export const DEFAULT_CONFIG = {
  // Where the person watching the sky is standing.
  // The default is an approximate spot on Lake Shore Drive in Charlevoix --
  // drag the house pin on the map to your exact address to fix it.
  home: {
    label: 'Home',
    lat: 45.3452,
    lon: -85.2848,
    elevationFt: 620,
    approximate: true,
  },
  // Charlevoix Municipal Airport.
  airport: {
    icao: 'KCVX',
    iata: 'CVX',
    name: 'Charlevoix Municipal Airport',
    lat: 45.3047,
    lon: -85.2753,
    elevationFt: 669,
  },
  // How far out from the airport to watch, in nautical miles.
  radiusNm: 40,
  // Seconds between checks of the live aircraft feed.
  pollSeconds: 15,
  // Live data sources, tried in order until one answers.
  sources: [
    { id: 'adsbfi', enabled: true },
    { id: 'adsblol', enabled: true },
    { id: 'airplaneslive', enabled: true, apiKey: '' },
  ],
  // Keep detailed sightings this many days; flight events are kept forever.
  retainSightingDays: 60,
  port: 4903,
  timezone: 'America/Detroit',
};

function deepMerge(base, override) {
  if (Array.isArray(base) || override === null || typeof override !== 'object') {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  let onDisk = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error(`config.json could not be read (${err.message}); using defaults.`);
    }
  }
  cached = deepMerge(DEFAULT_CONFIG, onDisk);
  return cached;
}

/**
 * Merge a patch into the config and write it out.
 * `base`/`filePath` are overridable so tests write to a scratch file rather
 * than the real config.json.
 */
export function saveConfig(patch, { base = loadConfig(), filePath = CONFIG_PATH } = {}) {
  const next = deepMerge(base, patch);
  const { configPath, ...persisted } = next;
  fs.writeFileSync(filePath, `${JSON.stringify(persisted, null, 2)}\n`);
  if (filePath === CONFIG_PATH) cached = next;
  return next;
}

export { ROOT, CONFIG_PATH };
