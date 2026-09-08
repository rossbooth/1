#!/usr/bin/env node
// Loads the FAA aircraft register so the tracker can name owners offline.
//
//   npm run import-registry                     download and import
//   npm run import-registry -- ./ReleasableAircraft.zip   import a file you already have
//   npm run import-registry -- ./some-folder    import an unzipped MASTER.txt/ACFTREF.txt

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, setMeta } from '../server/db.js';
import { importRegistry, registryCount, REGISTRY_URL } from '../server/faa.js';

const MANUAL_INSTRUCTIONS = `
Could not download the FAA database automatically.

You can do it by hand instead -- it only takes a minute:

  1. Open ${REGISTRY_URL}
     in a browser and save the file.
  2. Run this, pointing at wherever the file landed:

     npm run import-registry -- ~/Downloads/ReleasableAircraft.zip
`;

async function download(url, destination) {
  process.stdout.write('Downloading the FAA aircraft register (about 90 MB)... ');
  const res = await fetch(url, {
    headers: { 'user-agent': 'charlevoix-flight-tracker/1.0 (personal use)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`the FAA server answered HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  const handle = fs.createWriteStream(destination);
  let received = 0;
  for await (const chunk of res.body) {
    received += chunk.length;
    handle.write(chunk);
    if (total) process.stdout.write(`\rDownloading the FAA aircraft register... ${Math.round((received / total) * 100)}%   `);
  }
  await new Promise((resolve, reject) => handle.end(resolve).on('error', reject));
  process.stdout.write(`\rDownloaded ${(received / 1e6).toFixed(1)} MB.                    \n`);
  return destination;
}

async function main() {
  const arg = process.argv[2];
  const db = getDb();
  let source = arg;
  let temporary = null;

  if (!source) {
    temporary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'faa-')), 'ReleasableAircraft.zip');
    try {
      source = await download(REGISTRY_URL, temporary);
    } catch (err) {
      console.error(`\n${err.message}`);
      console.error(MANUAL_INSTRUCTIONS);
      process.exit(1);
    }
  } else if (!fs.existsSync(source)) {
    console.error(`No such file or folder: ${source}`);
    process.exit(1);
  }

  console.log('Importing... (this takes a minute or two)');
  const started = Date.now();
  const counts = importRegistry(db, source, ({ stage, count, done }) => {
    if (stage === 'aircraft' && !done) process.stdout.write(`\r  ${count.toLocaleString()} aircraft...`);
  });

  setMeta(db, 'registry_imported_at', Date.now());
  setMeta(db, 'registry_source', arg ?? REGISTRY_URL);

  if (temporary) fs.rmSync(path.dirname(temporary), { recursive: true, force: true });

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\r  ${counts.aircraft.toLocaleString()} aircraft and ${counts.models.toLocaleString()} models imported in ${seconds}s.`);
  console.log(`\nDone. The tracker now knows ${registryCount(db).toLocaleString()} registered owners.`);
  console.log('Re-run this every month or so to pick up new registrations.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
