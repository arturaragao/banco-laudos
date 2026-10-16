// Servidor local para testar o app: node ferramentas/servidor.mjs  ->  http://localhost:8765
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const arq = normalize(join(RAIZ, p));
  if (!arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(arq); res.writeHead(200, { "Content-Type": TIPOS[extname(arq)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(b); }
  catch { res.writeHead(404); res.end("não achei"); }
}).listen(8765, () => console.log("http://localhost:8765"));
