import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';
import { PORT, HOST, ROOT } from './config.js';
import { isEmpty } from './db.js';
import { seed } from './seed.js';
import { overview } from './alerts.js';
import { initPush } from './push.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(ROOT, '..', 'web', 'dist');

/* ── Initialisation de la base au premier lancement ── */
try {
  if (isEmpty()) {
    console.log('[epiwatch] Base vide → initialisation du jeu de démonstration…');
    const summary = seed({ reset: false });
    console.log('[epiwatch] Base initialisée :', summary);
  }
} catch (err) {
  console.error('[epiwatch] Échec de l’initialisation de la base :', err.message);
}

try {
  initPush();
  console.log('[epiwatch] Web Push initialisé');
} catch (err) {
  console.error('[epiwatch] Échec initialisation Web Push :', err.message);
}

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    const t = Date.now();
    _res.on('finish', () => {
      if (process.env.EPIWATCH_LOG !== '0' && req.path !== '/api/stream') {
        console.log(`${req.method} ${res_status(_res)} ${req.path} ${Date.now() - t}ms`);
      }
    });
  }
  next();
});
function res_status(res) { return res.statusCode; }

app.use('/api', api);

/* ── Application web compilée (mode production / démo un seul port) ── */
if (fs.existsSync(WEB_DIST)) {
  app.use(
    express.static(WEB_DIST, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        `<html><body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
        <h1>ÉpiWatch — API en ligne</h1>
        <p>L’interface web n’est pas encore compilée.</p>
        <p>Lancez <code>npm run dev</code> à la racine du projet, ou <code>npm run build</code> pour la version de démonstration.</p>
        <p><a href="/api/health">/api/health</a> · <a href="/api/overview">/api/overview</a></p>
        </body></html>`,
      );
  });
}

/* ── Démarrage ── */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

async function start() {
  const secure = process.argv.includes('--secure') || process.env.SECURE === '1';
  let server;

  if (secure) {
    try {
      const { default: selfsigned } = await import('selfsigned');
      const certDir = path.resolve(ROOT, 'data');
      const keyFile = path.join(certDir, 'dev-key.pem');
      const certFile = path.join(certDir, 'dev-cert.pem');
      let key;
      let cert;
      if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
        key = fs.readFileSync(keyFile);
        cert = fs.readFileSync(certFile);
      } else {
        const ips = ['127.0.0.1', ...lanAddresses()];
        const pems = selfsigned.generate(
          [{ name: 'commonName', value: 'epiwatch.local' }],
          {
            days: 365,
            keySize: 2048,
            algorithm: 'sha256',
            extensions: [
              { name: 'subjectAltName', altNames: ips.map((ip) => ({ type: 7, ip })) },
            ],
          },
        );
        fs.mkdirSync(certDir, { recursive: true });
        fs.writeFileSync(keyFile, pems.private);
        fs.writeFileSync(certFile, pems.cert);
        key = pems.private;
        cert = pems.cert;
      }
      const https = await import('node:https');
      server = https.createServer({ key, cert }, app);
      console.log('[epiwatch] Mode HTTPS auto-signé activé (PWA + notifications navigateur).');
    } catch (err) {
      console.warn('[epiwatch] HTTPS indisponible, passage en HTTP :', err.message);
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }

  server.keepAliveTimeout = 0;
  server.listen(PORT, HOST, () => {
    const scheme = secure ? 'https' : 'http';
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║              ÉpiWatch · Serveur actif            ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log(`  Local    : ${scheme}://localhost:${PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`  Réseau   : ${scheme}://${ip}:${PORT}   ← téléphones du jury`);
    }
    console.log(`  API      : ${scheme}://localhost:${PORT}/api/health`);
    console.log('');
    try {
      const o = overview();
      console.log(
        `  Données  : ${o.hospitals} hôpitaux · ${o.diseases} maladies · ` +
          `${o.alerts.active} alerte(s) active(s) · ${o.total_active} patients suivis`,
      );
    } catch {
      /* ignore */
    }
    console.log('');
  });

  const shutdown = () => {
    console.log('\n[epiwatch] Arrêt du serveur…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
