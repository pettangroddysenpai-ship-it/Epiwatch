/**
 * Bus temps réel minimaliste base sur Server-Sent Events (SSE).
 * Aucune dependance externe : fonctionne sur le reseau local (HTTP inclus),
 * contrairement aux WebSockets qui exigent parfois une configuration proxy.
 */

const clients = new Set();
let clientSeq = 0;

export function addClient(res) {
  const client = { id: ++clientSeq, res };
  clients.add(client);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 3000\n\n');
  write(client, 'hello', { clientId: client.id, at: Date.now() });

  return client;
}

export function removeClient(client) {
  clients.delete(client);
}

function write(client, event, data) {
  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(client);
  }
}

export function broadcast(event, data) {
  for (const client of clients) write(client, event, data);
}

export function clientCount() {
  return clients.size;
}

/** Battement de coeur pour maintenir les connexions ouvertes. */
setInterval(() => {
  for (const client of clients) {
    try {
      client.res.write(': ping\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 25000).unref();
