// Adaptador Google Drive para nuvem.js. Pasta "Banco de laudos" no Drive do Artur (com a subpasta "imagens").
// Escopo drive.file: o app só enxerga os arquivos que ele mesmo criou. Login pelo Google Identity Services (sem servidor):
// o token vale 1 hora; depois disso precisa de um toque em "Conectar" (abre a janelinha do Google e fecha sozinha).
import { comprimir, descomprimir } from "./nuvem.js";

const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UP = "https://www.googleapis.com/upload/drive/v3";
const PASTA = "Banco de laudos";
const PASTA_TIPO = "application/vnd.google-apps.folder";

export class ErroLogin extends Error { constructor() { super("Conecte ao Google Drive"); this.login = true; } }

const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let clientId = "";
let token = ler("drive.token");
export function configurar(id) { clientId = String(id || "").trim(); }
export const configurado = () => !!clientId;
export const conectado = () => !!token && Date.now() < token.expira - 60e3;
export const jaUsou = () => !!ler("drive.usou");

let gis = null;
function carregarGis() {
  gis ||= new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = ok;
    s.onerror = () => { gis = null; falha(new Error("sem internet para falar com o Google")); };
    document.head.appendChild(s);
  });
  return gis;
}
// carregar antes do toque: a janelinha do Google só abre se vier direto de um clique
export const prepararLogin = () => (clientId ? carregarGis().catch(() => {}) : null);

export async function conectar() {
  if (!clientId) throw new Error("falta o ID do cliente OAuth (Configurações)");
  await carregarGis();
  return new Promise((ok, falha) => {
    const c = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: ESCOPO,
      callback: (r) => {
        if (r.error) return falha(new Error(r.error_description || r.error));
        token = { valor: r.access_token, expira: Date.now() + (+r.expires_in || 3600) * 1000 };
        gravar("drive.token", token);
        gravar("drive.usou", true);
        ok();
      },
      error_callback: (e) => falha(new Error(e?.type === "popup_closed" ? "a janela do Google foi fechada" : e?.message || e?.type || "login cancelado")),
    });
    c.requestAccessToken({ prompt: jaUsou() ? "" : "consent" });
  });
}

export function desconectar() {
  try { if (token) google?.accounts?.oauth2?.revoke(token.valor, () => {}); } catch {}
  token = null;
  gravar("drive.token", null); gravar("drive.usou", null); gravar("drive.pastas", null);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(url, op = {}, tentativa = 0) {
  if (!conectado()) throw new ErroLogin();
  const r = await fetch(url, { ...op, headers: { ...(op.headers || {}), Authorization: `Bearer ${token.valor}` } });
  if (r.status === 401) { token = null; gravar("drive.token", null); throw new ErroLogin(); }
  if ((r.status === 429 || r.status === 403 || r.status >= 500) && tentativa < 4) {
    const corpo = r.status === 403 ? await r.clone().text() : "";
    if (r.status !== 403 || /rate|quota/i.test(corpo)) { await espera(1000 * 2 ** tentativa); return req(url, op, tentativa + 1); }
  }
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
const json = async (url, op) => (await req(url, op)).json();
const q = (s) => encodeURIComponent(s);

async function acharOuCriarPasta(nome, pai) {
  const filtro = `name='${nome}' and mimeType='${PASTA_TIPO}' and trashed=false` + (pai ? ` and '${pai}' in parents` : "");
  const r = await json(`${API}/files?q=${q(filtro)}&fields=files(id)&spaces=drive`);
  if (r.files?.[0]) return r.files[0].id;
  const c = await json(`${API}/files?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: PASTA_TIPO, ...(pai ? { parents: [pai] } : {}) }),
  });
  return c.id;
}
let pastas = ler("drive.pastas");
async function pastasDoApp() {
  if (pastas) return pastas;
  const raiz = await acharOuCriarPasta(PASTA);
  pastas = { raiz, imagens: await acharOuCriarPasta("imagens", raiz) };
  gravar("drive.pastas", pastas);
  return pastas;
}

function multipart(meta, blob) {
  const b = "lv" + Math.random().toString(36).slice(2);
  return {
    headers: { "Content-Type": `multipart/related; boundary=${b}` },
    body: new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
      blob, `\r\n--${b}--`]),
  };
}

export async function hashDe(blob) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function listarImagens() {
  const { imagens } = await pastasDoApp();
  const out = [];
  let pag = "";
  do {
    const r = await json(`${API}/files?q=${q(`'${imagens}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,createdTime,appProperties)&pageSize=1000${pag ? `&pageToken=${pag}` : ""}`);
    out.push(...(r.files || []));
    pag = r.nextPageToken || "";
  } while (pag);
  return out.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
}
let mapaImgs = null;
async function mapaImagens() {
  if (mapaImgs) return mapaImgs;
  const m = new Map();
  for (const f of await listarImagens()) {
    if (f.appProperties?.hash && !m.has("h:" + f.appProperties.hash)) m.set("h:" + f.appProperties.hash, f.id);
    if (!m.has("n:" + f.name)) m.set("n:" + f.name, f.id);
  }
  return (mapaImgs = m);
}
// arquivos [{id, name, createdTime, appProperties}] (do mais antigo ao mais novo) + ids usados pelos laudos -> ids a apagar.
// Repetida = mesmo nome ou mesmo hash. Nunca apaga uma imagem que algum laudo usa.
export function escolherRepetidas(arquivos, usados) {
  const grupos = new Map();
  const pai = new Map();
  const raiz = (x) => { while (pai.get(x) !== x) x = pai.get(x); return x; };
  const unir = (a, b) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) pai.set(rb, ra); };
  const primeiro = new Map();
  for (const f of arquivos) {
    pai.set(f.id, f.id);
    for (const k of ["n:" + f.name, f.appProperties?.hash ? "h:" + f.appProperties.hash : ""].filter(Boolean)) {
      if (primeiro.has(k)) unir(primeiro.get(k), f.id); else primeiro.set(k, f.id);
    }
  }
  for (const f of arquivos) { const r = raiz(f.id); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(f.id); }
  const apagar = [];
  for (const ids of grupos.values()) {
    if (ids.length < 2) continue;
    const fica = ids.some((id) => usados.has(id)) ? null : ids[0];
    for (const id of ids) if (id !== fica && !usados.has(id)) apagar.push(id);
  }
  return apagar;
}

export const adaptador = {
  async listar() {
    const { raiz } = await pastasDoApp();
    const out = [];
    let pag = "";
    do {
      const r = await json(`${API}/files?q=${q(`'${raiz}' in parents and trashed=false and mimeType!='${PASTA_TIPO}'`)}&fields=nextPageToken,files(id,name,version)&pageSize=1000${pag ? `&pageToken=${pag}` : ""}`);
      for (const f of r.files || []) if (/^laudos-.*\.json\.gz$/.test(f.name)) out.push({ nome: f.name, id: f.id, versao: f.version });
      pag = r.nextPageToken || "";
    } while (pag);
    return out;
  },
  async ler(id) { return descomprimir(await (await req(`${API}/files/${id}?alt=media`)).blob()); },
  async versao(id) { return (await json(`${API}/files/${id}?fields=version`)).version; },
  async gravar(nome, id, regs) {
    const blob = await comprimir(regs);
    if (id) {
      const r = await json(`${UP}/files/${id}?uploadType=media&fields=id,version`, { method: "PATCH", headers: { "Content-Type": "application/gzip" }, body: blob });
      return { id: r.id, versao: r.version };
    }
    const { raiz } = await pastasDoApp();
    const r = await json(`${UP}/files?uploadType=multipart&fields=id,version`, { method: "POST", ...multipart({ name: nome, parents: [raiz], mimeType: "application/gzip" }, blob) });
    return { id: r.id, versao: r.version };
  },
  // nada repetido: antes de enviar, procura uma imagem igual (mesmo conteúdo = mesmo hash SHA-256, ou mesmo nome
  // "acesso_i" das que foram enviadas antes do hash existir) e reaproveita
  async enviarImagem(nome, blob) {
    const mapa = await mapaImagens();
    const hash = await hashDe(blob);
    const ja = mapa.get("h:" + hash) || mapa.get("n:" + nome);
    if (ja) return ja;
    const { imagens } = await pastasDoApp();
    const id = (await json(`${UP}/files?uploadType=multipart&fields=id`, {
      method: "POST", ...multipart({ name: nome, parents: [imagens], appProperties: { hash } }, blob),
    })).id;
    mapa.set("h:" + hash, id);
    mapa.set("n:" + nome, id);
    return id;
  },
  // apaga as cópias repetidas que já estão no Drive (fica a que algum laudo usa; se nenhum usa, a mais antiga)
  async limparRepetidas(usados) {
    const apagar = escolherRepetidas(await listarImagens(), usados);
    for (const id of apagar) await req(`${API}/files/${id}`, { method: "DELETE" });
    mapaImgs = null;
    return apagar.length;
  },
  async baixarImagem(id) { return (await req(`${API}/files/${id}?alt=media`)).blob(); },
};
