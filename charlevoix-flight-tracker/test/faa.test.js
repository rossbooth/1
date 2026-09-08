import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { importRegistry, lookupByRegistration, lookupByHex, searchRegistry, formatFaaDate } from '../server/faa.js';
import { nNumberToHex, hexToNNumber, US_ICAO_MIN, US_ICAO_MAX } from '../server/nnumber.js';

const FIXTURE_DIR = new URL('../fixtures/faa-sample', import.meta.url).pathname;
const FIXTURE_ZIP = new URL('../fixtures/faa-sample.zip', import.meta.url).pathname;

function freshDb() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cvx-')), 'test.db');
  return openDatabase(file);
}

test('N-number and ICAO hex convert both ways at the ends of the US block', () => {
  assert.equal(nNumberToHex('N1'), 'a00001');
  assert.equal(nNumberToHex('N99999'), 'adf7c7');
  assert.equal(hexToNNumber('a00001'), 'N1');
  assert.equal(hexToNNumber('adf7c7'), 'N99999');
  assert.equal(nNumberToHex('n400cv'), nNumberToHex('N400CV'), 'case and prefix insensitive');
});

test('addresses outside the US block have no N-number', () => {
  assert.equal(hexToNNumber('3c6444'), null, 'German registration');
  assert.equal(hexToNNumber(US_ICAO_MIN - 1), null);
  assert.equal(hexToNNumber(''), null);
  assert.equal(nNumberToHex('G-ABCD'), null, 'not a US tail');
  assert.equal(nNumberToHex('N0123'), null, 'cannot start with zero');
  assert.equal(nNumberToHex('N1IO'), null, 'I and O are not used');
  assert.equal(nNumberToHex('N123456'), null, 'too long');
});

test('every address in the US block round-trips through a tail number', () => {
  // 915,399 addresses: proves the mapping is a bijection, not just plausible.
  let checked = 0;
  for (let icao = US_ICAO_MIN; icao <= US_ICAO_MAX; icao += 1) {
    const hex = icao.toString(16).padStart(6, '0');
    if (nNumberToHex(hexToNNumber(hex)) !== hex) {
      assert.fail(`round trip failed at ${hex} -> ${hexToNNumber(hex)}`);
    }
    checked += 1;
  }
  assert.equal(checked, 915399);
});

test('the FAA registry imports from the published zip', () => {
  const db = freshDb();
  const counts = importRegistry(db, FIXTURE_ZIP);
  assert.equal(counts.aircraft, 4);
  assert.equal(counts.models, 4);
});

test('an imported aircraft resolves to a readable owner record', () => {
  const db = freshDb();
  importRegistry(db, FIXTURE_DIR);

  const ac = lookupByRegistration(db, 'N400CV');
  assert.equal(ac.registration, 'N400CV');
  assert.equal(ac.owner, 'CHARLEVOIX AVIATION LLC');
  assert.equal(ac.ownerType, 'LLC');
  assert.equal(ac.ownerLocation, 'CHARLEVOIX, MI');
  assert.equal(ac.manufacturer, 'CESSNA');
  assert.equal(ac.model, '172N');
  assert.equal(ac.yearManufactured, 1979);
  assert.equal(ac.aircraftType, 'Fixed wing, single engine');
  assert.equal(ac.engineType, 'Piston');
  assert.equal(ac.seats, 4);
  assert.equal(ac.status, 'Valid registration');
  assert.equal(ac.registrationExpires, '2028-10-31');
});

test('registrant type codes are decoded', () => {
  const db = freshDb();
  importRegistry(db, FIXTURE_DIR);
  assert.equal(lookupByRegistration(db, 'N12345').ownerType, 'Corporation');
  assert.equal(lookupByRegistration(db, 'N9ZZ').ownerType, 'Individual');
  assert.equal(lookupByRegistration(db, 'N9ZZ').status, 'Deregistered');
  assert.equal(lookupByRegistration(db, 'N12345').engineType, 'Turboprop');
});

test('lookup by hex works, including when the FAA row has no hex column', () => {
  const db = freshDb();
  importRegistry(db, FIXTURE_DIR);

  assert.equal(lookupByHex(db, 'a4acfc').owner, 'CHARLEVOIX AVIATION LLC');
  assert.equal(lookupByHex(db, 'A4ACFC').owner, 'CHARLEVOIX AVIATION LLC', 'case insensitive');
  // N737BA was imported with an empty MODE S CODE HEX field.
  assert.equal(lookupByHex(db, nNumberToHex('N737BA')).owner, 'BOEING COMPANY THE');
  assert.equal(lookupByHex(db, '3c6444'), null, 'foreign aircraft are not in the US register');
});

test('the registry is searchable by tail number and owner name', () => {
  const db = freshDb();
  importRegistry(db, FIXTURE_DIR);

  assert.equal(searchRegistry(db, 'CHARLEVOIX')[0].registration, 'N400CV');
  assert.equal(searchRegistry(db, 'N400CV')[0].owner, 'CHARLEVOIX AVIATION LLC');
  assert.equal(searchRegistry(db, '400CV')[0].owner, 'CHARLEVOIX AVIATION LLC', 'N prefix optional');
  assert.deepEqual(searchRegistry(db, 'a'), [], 'too short to search');
});

test('re-importing updates rows instead of duplicating them', () => {
  const db = freshDb();
  importRegistry(db, FIXTURE_DIR);
  importRegistry(db, FIXTURE_DIR);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM registry').get().n, 4);
});

test('FAA dates are reformatted, and junk dates are dropped', () => {
  assert.equal(formatFaaDate('20281031'), '2028-10-31');
  assert.equal(formatFaaDate('        '), null);
  assert.equal(formatFaaDate(null), null);
});
