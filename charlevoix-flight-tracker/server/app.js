import express from 'express';
import path from 'node:path';
import { ROOT } from './config.js';
import { createRouter } from './routes.js';

/** Wire up the HTTP surface. Kept separate from index.js so tests can mount it. */
export function createApp({ service, store, db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', createRouter({ service, store, db, config }));
  app.use('/vendor/leaflet', express.static(path.join(ROOT, 'node_modules', 'leaflet', 'dist')));
  app.use(express.static(path.join(ROOT, 'public')));
  return app;
}
