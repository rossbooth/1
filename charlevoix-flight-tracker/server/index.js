import { loadConfig } from './config.js';
import { getDb } from './db.js';
import { Store } from './store.js';
import { AdsbClient } from './adsb.js';
import { TrackerService } from './service.js';
import { createApp } from './app.js';
import { demoFeed } from './demo.js';
import { registryCount } from './faa.js';

const demo = process.argv.includes('--demo');

const config = loadConfig();
const db = getDb();
const store = new Store(db);
const client = new AdsbClient({
  sources: demo ? [{ id: 'adsbfi', enabled: true }] : config.sources,
  fetchImpl: demo ? demoFeed({ airport: config.airport }) : undefined,
});
const service = new TrackerService({ config, store, client });
const app = createApp({ service, store, db, config });

const port = Number(process.env.PORT) || config.port;
const server = app.listen(port, () => {
  const rows = registryCount(db);
  console.log('');
  console.log(`  ${config.airport.name} flight tracker`);
  console.log('  ------------------------------------------------');
  console.log(`  Open this in your browser:   http://localhost:${port}`);
  console.log(`  Watching:                    ${config.radiusNm} nm around ${config.airport.icao}`);
  console.log(`  Owner lookups:               ${rows ? `${rows.toLocaleString()} aircraft on file` : 'not loaded yet -- run: npm run import-registry'}`);
  if (demo) console.log('  Mode:                        DEMO (made-up aircraft, no live data)');
  if (config.home.approximate) {
    console.log('  Note:                        the house pin is approximate -- drag it to your address');
  }
  console.log('');
  service.start();
});

function shutdown() {
  console.log('\nStopping...');
  service.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
