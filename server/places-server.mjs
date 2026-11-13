import http from 'node:http';
import { createPlacesService, PlacesError } from './places-core.mjs';

// Development-only proxy. Do not expose this unauthenticated process to the internet.
const host = process.env.PLACES_HOST || '127.0.0.1';
const port = Number(process.env.PLACES_PORT || 8787);
const allowedOrigins = new Set((process.env.PLACES_ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(s => s.trim()));
const service = createPlacesService({ key: process.env.GOOGLE_MAPS_API_KEY, staticKey: process.env.GOOGLE_MAPS_STATIC_API_KEY || process.env.GOOGLE_MAPS_API_KEY });
const rates = new Map();
let hourly = { count: 0, reset: Date.now() + 3600000 };
function rate(ip) {
  const now = Date.now();
  for (const [key, entry] of rates) if (entry.reset <= now) rates.delete(key);
  if (now > hourly.reset) hourly = { count: 0, reset: now + 3600000 };
  const entry = rates.get(ip) || { count: 0, reset: now + 60000 };
  if (entry.count >= 30 || hourly.count >= 300) throw new PlacesError('開發環境查詢次數已達限制，請稍後再試。', 429);
  entry.count++; hourly.count++; rates.set(ip, entry);
}
async function jsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 8192) throw new PlacesError('查詢內容太長。', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new PlacesError('查詢格式不正確。'); }
}
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: '來源未獲允許。' })); return; }
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ mode: process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'unconfigured', developmentOnly: true })); return; }
    rate(request.socket.remoteAddress || 'unknown');
    if (request.method === 'GET' && url.pathname === '/map') {
      const map = await service.map(url.searchParams.get('placeId'));
      response.writeHead(200, { 'Content-Type': map.type }); response.end(map.bytes); return;
    }
    if (request.method !== 'POST' || !['/autocomplete', '/details'].includes(url.pathname)) throw new PlacesError('找不到此功能。', 404);
    if (!request.headers['content-type']?.startsWith('application/json')) throw new PlacesError('請使用 JSON 查詢格式。', 415);
    const body = await jsonBody(request);
    const result = url.pathname === '/autocomplete' ? await service.autocomplete(body) : await service.details(body);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(result));
  } catch (cause) {
    response.writeHead(cause instanceof PlacesError ? cause.status : 500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: cause instanceof PlacesError ? cause.message : '服務暫時無法使用。' }));
  }
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
server.listen(port, host, () => { console.log(`Places development proxy: http://${host}:${port}`); console.log('Only for trusted local development. No API keys are sent to the App.'); });
