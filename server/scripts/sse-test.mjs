/**
 * Vérifie que le flux SSE diffuse bien les alertes en temps réel.
 * Lancer le serveur sur le port 4000, puis : node scripts/sse-test.mjs
 */
const BASE = process.env.BASE || 'http://localhost:4000';
const controller = new AbortController();

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()).token;
}

const token = await login('admin@epiwatch.cm', 'Admin@2026');

const received = [];
const res = await fetch(`${BASE}/api/stream?token=${token}`, {
  headers: { Accept: 'text/event-stream' },
  signal: controller.signal,
});

console.log('Flux SSE connecté :', res.status === 200);

const reader = res.body.getReader();
const decoder = new TextDecoder();
const pump = (async () => {
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:') || line.startsWith('data:')) {
          received.push(line);
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }
})();

await new Promise((r) => setTimeout(r, 500));
console.log('Messages initiaux :', received.length);

// Provoque une escalation
const hospitals = await (await fetch(`${BASE}/api/hospitals`)).json();
const disease = (await (await fetch(`${BASE}/api/diseases`)).json()).diseases.find((d) => d.code === 'cholera');
const target = hospitals.hospitals.find((h) => h.region_name === 'Extrême-Nord') || hospitals.hospitals[0];

await fetch(`${BASE}/api/cases`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    hospital_id: target.id,
    disease_id: disease.id,
    new_cases: 900,
    patients_under_care: 3000,
  }),
});

await new Promise((r) => setTimeout(r, 800));
controller.abort();
await pump;

const hasAlert = received.some((l) => l.includes('alert'));
console.log('Événements reçus après escalade :', received.length);
console.log('Contient un événement "alert" :', hasAlert);
console.log(hasAlert ? '\nSSE OK' : '\nSSE ÉCHEC');
process.exit(hasAlert ? 0 : 1);
