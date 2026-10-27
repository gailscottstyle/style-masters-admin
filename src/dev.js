import { createServer } from 'node:http';
import { createApp } from './app.js';
const app = createApp();
const server = createServer(async (req, res) => {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 4_300_000) { res.writeHead(413); res.end('Upload too large'); return; } chunks.push(chunk); }
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
    const response = await app(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Request failed'); }
});
server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => console.log(`Style Masters: http://127.0.0.1:${process.env.PORT || 4317}/clients`));
