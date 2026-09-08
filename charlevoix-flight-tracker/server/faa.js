// The FAA publishes its aircraft registration database as a weekly zip. Import
// it once and every US tail number resolves to a registered owner, model and
// year without any further network access.

import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { hexToNNumber, nNumberToHex } from './nnumber.js';

export const REGISTRY_URL = 'https://registry.faa.gov/database/ReleasableAircraft.zip';

const REGISTRANT_TYPE = {
  1: 'Individual',
  2: 'Partnership',
  3: 'Corporation',
  4: 'Co-owned',
  5: 'Government',
  7: 'LLC',
  8: 'Non-citizen corporation',
  9: 'Non-citizen co-owned',
};

const AIRCRAFT_TYPE = {
  1: 'Glider',
  2: 'Balloon',
  3: 'Blimp / dirigible',
  4: 'Fixed wing, single engine',
  5: 'Fixed wing, multi engine',
  6: 'Rotorcraft',
  7: 'Weight-shift-control',
  8: 'Powered parachute',
  9: 'Gyroplane',
  H: 'Hybrid lift',
  O: 'Other',
};

const ENGINE_TYPE = {
  0: 'None',
  1: 'Piston',
  2: 'Turboprop',
  3: 'Turboshaft',
  4: 'Turbojet',
  5: 'Turbofan',
  6: 'Ramjet',
  7: 'Two cycle',
  8: 'Four cycle',
  9: 'Unknown',
  10: 'Electric',
  11: 'Rotary',
};

// Only the codes we are sure of; anything else is shown as-is.
const STATUS = {
  V: 'Valid registration',
  R: 'Registration pending',
  M: 'Registered to the manufacturer (dealer certificate)',
  D: 'Expired dealer certificate',
  W: 'Deregistered',
  E: 'Registration revoked',
  N: 'Non-citizen corporation',
};

const norm = (h) => h.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Walk a big comma-separated FAA file without slicing it into one huge array.
 * Yields objects keyed by normalised header name.
 */
function* rows(text) {
  let start = text.indexOf('\n');
  if (start < 0) return;
  const headers = text.slice(0, start).replace(/\r$/, '').split(',').map(norm);
  start += 1;

  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    start = end + 1;
    if (!line.trim()) continue;
    const cells = line.split(',');
    const row = {};
    for (let i = 0; i < headers.length; i += 1) row[headers[i]] = (cells[i] ?? '').trim();
    yield row;
  }
}

const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Pull MASTER.txt and ACFTREF.txt out of the FAA zip (or a folder of them). */
export function readRegistryFiles(source) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    const pick = (name) => {
      const hit = fs.readdirSync(source).find((f) => f.toUpperCase() === name);
      return hit ? fs.readFileSync(`${source}/${hit}`, 'utf8') : null;
    };
    return { master: pick('MASTER.TXT'), models: pick('ACFTREF.TXT') };
  }
  const zip = new AdmZip(source);
  const get = (name) => {
    const entry = zip.getEntries().find((e) => e.entryName.toUpperCase().endsWith(name));
    return entry ? entry.getData().toString('utf8') : null;
  };
  return { master: get('MASTER.TXT'), models: get('ACFTREF.TXT') };
}

/**
 * Load the registry into SQLite. Replaces whatever was there before.
 * @returns {{aircraft: number, models: number}} row counts
 */
export function importRegistry(db, source, onProgress = () => {}) {
  const { master, models } = readRegistryFiles(source);
  if (!master) throw new Error('MASTER.txt not found in the FAA download');

  let modelCount = 0;
  if (models) {
    const insertModel = db.prepare(`
      INSERT INTO registry_models (code, manufacturer, model, type_acft, type_eng, ac_cat, no_eng, no_seats, ac_weight, speed)
      VALUES (@code, @manufacturer, @model, @type_acft, @type_eng, @ac_cat, @no_eng, @no_seats, @ac_weight, @speed)
      ON CONFLICT(code) DO UPDATE SET
        manufacturer=excluded.manufacturer, model=excluded.model, type_acft=excluded.type_acft,
        type_eng=excluded.type_eng, ac_cat=excluded.ac_cat, no_eng=excluded.no_eng,
        no_seats=excluded.no_seats, ac_weight=excluded.ac_weight, speed=excluded.speed`);
    db.transaction(() => {
      for (const r of rows(models)) {
        if (!r.CODE) continue;
        insertModel.run({
          code: r.CODE,
          manufacturer: r.MFR || null,
          model: r.MODEL || null,
          type_acft: r.TYPEACFT || null,
          type_eng: r.TYPEENG || null,
          ac_cat: r.ACCAT || null,
          no_eng: int(r.NOENG),
          no_seats: int(r.NOSEATS),
          ac_weight: r.ACWEIGHT || null,
          speed: int(r.SPEED),
        });
        modelCount += 1;
      }
    })();
    onProgress({ stage: 'models', count: modelCount });
  }

  const insert = db.prepare(`
    INSERT INTO registry (n_number, serial_number, mfr_mdl_code, eng_mfr_mdl, year_mfr, type_registrant,
      owner_name, street, city, state, zip_code, country, last_action_date, cert_issue_date,
      status_code, mode_s_hex, expiration_date, kit_mfr, kit_model)
    VALUES (@n_number, @serial_number, @mfr_mdl_code, @eng_mfr_mdl, @year_mfr, @type_registrant,
      @owner_name, @street, @city, @state, @zip_code, @country, @last_action_date, @cert_issue_date,
      @status_code, @mode_s_hex, @expiration_date, @kit_mfr, @kit_model)
    ON CONFLICT(n_number) DO UPDATE SET
      serial_number=excluded.serial_number, mfr_mdl_code=excluded.mfr_mdl_code,
      eng_mfr_mdl=excluded.eng_mfr_mdl, year_mfr=excluded.year_mfr,
      type_registrant=excluded.type_registrant, owner_name=excluded.owner_name,
      street=excluded.street, city=excluded.city, state=excluded.state, zip_code=excluded.zip_code,
      country=excluded.country, last_action_date=excluded.last_action_date,
      cert_issue_date=excluded.cert_issue_date, status_code=excluded.status_code,
      mode_s_hex=excluded.mode_s_hex, expiration_date=excluded.expiration_date,
      kit_mfr=excluded.kit_mfr, kit_model=excluded.kit_model`);

  let count = 0;
  db.transaction(() => {
    for (const r of rows(master)) {
      const tail = (r.NNUMBER || '').toUpperCase();
      if (!tail) continue;
      const street = [r.STREET, r.STREET2].filter(Boolean).join(' ').trim();
      // Prefer the hex the FAA publishes; fall back to deriving it from the tail.
      const hex = (r.MODESCODEHEX || '').trim().toLowerCase() || nNumberToHex(tail) || null;
      insert.run({
        n_number: `N${tail}`,
        serial_number: r.SERIALNUMBER || null,
        mfr_mdl_code: r.MFRMDLCODE || null,
        eng_mfr_mdl: r.ENGMFRMDL || null,
        year_mfr: int(r.YEARMFR),
        type_registrant: r.TYPEREGISTRANT || null,
        owner_name: r.NAME || null,
        street: street || null,
        city: r.CITY || null,
        state: r.STATE || null,
        zip_code: r.ZIPCODE || null,
        country: r.COUNTRY || null,
        last_action_date: r.LASTACTIONDATE || null,
        cert_issue_date: r.CERTISSUEDATE || null,
        status_code: r.STATUSCODE || null,
        mode_s_hex: hex,
        expiration_date: r.EXPIRATIONDATE || null,
        kit_mfr: r.KITMFR || null,
        kit_model: r.KITMODEL || null,
      });
      count += 1;
      if (count % 25000 === 0) onProgress({ stage: 'aircraft', count });
    }
  })();
  onProgress({ stage: 'aircraft', count, done: true });
  return { aircraft: count, models: modelCount };
}

const SELECT = `
  SELECT r.*, m.manufacturer, m.model, m.type_acft, m.type_eng, m.no_eng, m.no_seats, m.speed, m.ac_weight
  FROM registry r LEFT JOIN registry_models m ON m.code = r.mfr_mdl_code`;

/** Look up an owner by tail number, e.g. "N400CV". */
export function lookupByRegistration(db, reg) {
  const tail = String(reg ?? '').trim().toUpperCase();
  if (!tail) return null;
  const key = tail.startsWith('N') ? tail : `N${tail}`;
  return decorate(db.prepare(`${SELECT} WHERE r.n_number = ?`).get(key));
}

/**
 * Look up an owner by ICAO hex. Tries the hex column first, then falls back to
 * the tail number the address encodes.
 */
export function lookupByHex(db, hex) {
  const key = String(hex ?? '').trim().toLowerCase();
  if (!key) return null;
  const direct = db.prepare(`${SELECT} WHERE r.mode_s_hex = ?`).get(key);
  if (direct) return decorate(direct);
  const tail = hexToNNumber(key);
  return tail ? lookupByRegistration(db, tail) : null;
}

/** Free-text search across tail numbers and owner names. */
export function searchRegistry(db, query, limit = 40) {
  const q = String(query ?? '').trim().toUpperCase();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const tail = q.startsWith('N') ? q : `N${q}`;
  return db
    .prepare(`${SELECT} WHERE r.n_number = ? OR r.n_number LIKE ? OR r.owner_name LIKE ? LIMIT ?`)
    .all(tail, `${tail}%`, like, limit)
    .map(decorate);
}

/** Turn FAA code columns into something a person can read. */
export function decorate(row) {
  if (!row) return null;
  const yearMfr = row.year_mfr || null;
  return {
    registration: row.n_number,
    owner: row.owner_name || null,
    ownerType: REGISTRANT_TYPE[row.type_registrant] ?? (row.type_registrant || null),
    ownerCity: row.city || null,
    ownerState: row.state || null,
    ownerCountry: row.country || null,
    ownerLocation: [row.city, row.state].filter(Boolean).join(', ') || null,
    manufacturer: row.manufacturer || row.kit_mfr || null,
    model: row.model || row.kit_model || null,
    yearManufactured: yearMfr,
    serialNumber: row.serial_number || null,
    aircraftType: AIRCRAFT_TYPE[row.type_acft] ?? (row.type_acft || null),
    engineType: ENGINE_TYPE[row.type_eng] ?? (row.type_eng || null),
    engines: row.no_eng || null,
    seats: row.no_seats || null,
    cruiseSpeedKt: row.speed || null,
    status: STATUS[row.status_code] ?? (row.status_code ? `Status code ${row.status_code}` : null),
    statusCode: row.status_code || null,
    registrationExpires: formatFaaDate(row.expiration_date),
    certificateIssued: formatFaaDate(row.cert_issue_date),
    modeSHex: row.mode_s_hex || null,
  };
}

/** FAA dates arrive as YYYYMMDD. */
export function formatFaaDate(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function registryCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM registry').get().n;
}

export { REGISTRANT_TYPE, AIRCRAFT_TYPE, ENGINE_TYPE, STATUS };
