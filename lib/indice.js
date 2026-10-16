// Índice de busca em memória: textos por seção, classificações, achados e facetas com contagem.
// Tudo por regras (lib/filtros.js, lib/secoes.js, lib/classificacoes.js, lib/destaque.js); nada sai do aparelho.
import { dividirLaudo } from "./secoes.js";
import { textoDoParagrafo } from "./laudo2notion.js";
import { confere, normalizar, raiz, interpretar } from "./filtros.js";
import { classificacoes } from "./classificacoes.js";
import { analisarItem } from "./destaque.js";
import { tituloExame, nomeMedico, grafiaOficial } from "./nomes.js";

const SECOES = { conclusao: ["conclusao"], achados: ["achados", "comparacao", "comentarios"], indicacao: ["indicacao"] };
const cache = new Map();          // acc -> {chave, ix}

export const MODALIDADES = { CT: "TC", TC: "TC", MR: "RM", RM: "RM", MRI: "RM", US: "US", CR: "RX", DX: "RX", RX: "RX", MG: "MG", NM: "MN", PT: "PET", XA: "Angio" };
// Ordem (16/10/2026, para nenhum exame de TC/RM ficar de fora): 1) o título ("TC TÓRAX", "ANGIOTOMOGRAFIA", "RNM", "URO-TC"...),
// 2) a modalidade do portal ("ct", "CT OT", "MR\SR"...; com TC/RM antes das outras), 3) o texto do laudo (técnica do exame; RM antes,
// porque laudo de RM costuma citar "tomografia prévia").
const TITULO = [
  ["TC", /(?:^|[^a-z])(?:[a-z]+-)?(?:tc|tcmd|tomografia|tomo|angiotomografia|angio-?tc)(?![a-z])/],
  ["RM", /(?:^|[^a-z])(?:[a-z]+-)?(?:rm|rnm|rmn|ressonancia|angiorressonancia|angio-?rm|artro-?rm)(?![a-z])/],
  ["US", /(?:^|[^a-z])(?:us|usg|doppler|ecografia|ultrassonografia)(?![a-z])/],
  ["MG", /(?:^|[^a-z])(?:mamografia|mmg)(?![a-z])/],
  ["RX", /(?:^|[^a-z])(?:rx|radiografia)(?![a-z])/],
];
const TEXTO = [
  ["RM", /\b(?:ressonancia|ponderad[ao]s? em t[12]|sequencias? (?:ponderadas|em t[12])|gadolinio|stir|flair|difusao)\b/],
  ["TC", /\b(?:tomografia|tomografo|tomograficos?|multidetectores|multislice|helicoidal|unidades hounsfield|\d+\s*uh)\b/],
];
const PRIORIDADE = ["TC", "RM", "MG", "US", "RX", "MN", "PET", "Angio"];
export function modalidade(r) {
  const t = normalizar(tituloExame(r.titulo)).replace(/[^a-z0-9-]+/g, " ");
  for (const [m, re] of TITULO) if (re.test(t)) return m;
  const doPortal = String(r.mod || "").toUpperCase().split(/[^A-Z]+/).map((tk) => MODALIDADES[tk]).filter(Boolean);
  for (const m of PRIORIDADE) if (doPortal.includes(m)) return m;
  const tx = normalizar(String(r.texto || "").slice(0, 3000));
  for (const [m, re] of TEXTO) if (re.test(tx)) return m;
  return "Outros";
}

export function indexar(r) {
  const chave = `${r.mudadoEm || 0}|${r.anotEm || 0}|${r.resumoVersao || 0}`;
  const c = cache.get(r.acc);
  if (c && c.chave === chave) { c.ix.r = r; return c.ix; }
  const div = dividirLaudo(r.pars || []);
  const sec = (ks) => ks.flatMap((k) => div.secoes[k] || []).map(textoDoParagrafo).join("\n");
  const tudo = [r.texto || (r.pars || []).map(textoDoParagrafo).join("\n"), r.nota || ""].join("\n");
  const conclusao = sec(SECOES.conclusao) || r.conclusao || "";
  const classes = classificacoes(tudo);
  // achados da conclusão (para a relevância): só itens com alteração
  let gravidade = 0, nAlter = 0;
  const feat = new Set(classes);
  for (const item of conclusao.split("\n")) {
    const a = analisarItem(item);
    if (a.normal) continue;
    nAlter++;
    gravidade += a.gravidade;
    for (const w of a.achados) feat.add(raiz(w).slice(0, 8));
  }
  const ix = {
    r, tudo, conclusao,
    achados: sec(SECOES.achados),
    indicacao: sec(SECOES.indicacao) || r.indicacao || "",
    classes,
    achadosEtq: r.etiquetas || [],
    mod: modalidade(r),
    exame: tituloExame(r.titulo),
    medico: nomeMedico(r.medico),
    temImg: Math.max(r.nImagens || 0, r.imgs?.length || 0) > 0,
    gravidade, nAlter, feat: [...feat],
  };
  cache.set(r.acc, { chave, ix });
  return ix;
}

// TÓRAX e TORAX, "Maria Souza" e "MARIA SOUZA": uma grafia só para todos
export function padronizar(ixs) {
  const ex = grafiaOficial(ixs.map((ix) => ix.exame));
  const md = grafiaOficial(ixs.filter((ix) => ix.medico).map((ix) => ix.medico));
  for (const ix of ixs) { ix.exame = ex(ix.exame); if (ix.medico) ix.medico = md(ix.medico); }
  return ixs;
}

// ---------- filtros ----------
// f = {q, onde, de, ate, normal, fav, img, facetas: {mod: [], exame: [], medico: [], classe: [], achado: [], colecao: []}}
export const GRUPOS = ["mod", "exame", "medico", "classe", "achado", "colecao"];
const valoresDe = (ix, g) => (g === "mod" ? [ix.mod] : g === "exame" ? [ix.exame] : g === "medico" ? (ix.medico ? [ix.medico] : [])
  : g === "classe" ? ix.classes : g === "achado" ? ix.achadosEtq : g === "colecao" ? (ix.r.colecoes || []) : []);

function passaBase(ix, f, consulta) {
  const r = ix.r;
  if (f.de && r.data < f.de) return false;
  if (f.ate && r.data > f.ate) return false;
  if (f.normal === "alt" && r.normal) return false;
  if (f.normal === "normal" && !r.normal) return false;
  if (f.fav && !r.fav) return false;
  if (f.img && !ix.temImg) return false;
  if (consulta) {
    if (/^\d{5,}$/.test(consulta.trim())) return r.acc === consulta.trim();
    const alvo = f.onde && f.onde !== "tudo" ? ix[f.onde] : ix.tudo;
    if (!confere(consulta, alvo || "", { ignorarNegados: true, sinonimos: true })) return false;
  }
  return true;
}
const passaGrupo = (ix, f, g) => !f.facetas?.[g]?.length || valoresDe(ix, g).some((v) => f.facetas[g].includes(v));

// devolve {lista (ix), contagens: {grupo: [[valor, n], ...]}}; contagem de cada grupo ignora o próprio grupo (padrão de facetas)
export function filtrar(ixs, f, consulta) {
  const lista = [];
  const cont = Object.fromEntries(GRUPOS.map((g) => [g, new Map()]));
  for (const ix of ixs) {
    if (!passaBase(ix, f, consulta)) continue;
    const ok = GRUPOS.map((g) => passaGrupo(ix, f, g));
    const falhas = ok.filter((x) => !x).length;
    if (!falhas) lista.push(ix);
    GRUPOS.forEach((g, i) => {
      if (falhas === 0 || (falhas === 1 && !ok[i])) for (const v of new Set(valoresDe(ix, g))) cont[g].set(v, (cont[g].get(v) || 0) + 1);
    });
  }
  const contagens = Object.fromEntries(GRUPOS.map((g) => [g, [...cont[g]].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))]));
  return { lista, contagens };
}

// ---------- ordem ----------
export function termosPositivos(consulta) {
  const ws = [];
  for (const { inc } of interpretar(consulta || "")) for (const t of inc) for (const v of t.vs || []) for (const alt of v) for (const w of alt) ws.push(w);
  return [...new Set(ws.filter((w) => w && w.length >= 2))];
}
// relevância: primeiro os laudos com achados mais RAROS no banco (peso pela raridade de cada achado/classificação),
// mais GRAVES (neoplasia, TEP, RADS alto...) e mais COMPLEXOS (mais itens alterados na conclusão). Normais vão para o fim.
export function ordenar(lista, ordem, consulta, universo = lista) {
  const porData = (a, b) => String(b.r.data).localeCompare(String(a.r.data));
  if (ordem === 'antigo') return lista.sort((a, b) => -porData(a, b));
  if (ordem === 'relevancia') {
    const df = new Map();
    for (const ix of universo) for (const f of ix.feat) df.set(f, (df.get(f) || 0) + 1);
    const n = universo.length + 1;
    const nota = (ix) => {
      if (!ix.nAlter && !ix.classes.length) return 0;
      const idf = ix.feat.map((f) => Math.log(n / ((df.get(f) || 0) + 1))).sort((a, b) => b - a).slice(0, 3);
      return idf.reduce((s, x) => s + x, 0) + ix.gravidade * 1.5 + ix.nAlter * 0.4;
    };
    const sc = new Map(lista.map((ix) => [ix, nota(ix)]));
    return lista.sort((a, b) => sc.get(b) - sc.get(a) || porData(a, b));
  }
  return lista.sort(porData);
}

// ---------- destaque dos termos buscados ----------
// texto -> [{t, m}] (m = trecho que bate com algum termo)
export function marcar(texto, termos) {
  if (!termos?.length) return [{ t: texto, m: false }];
  const out = [];
  let ult = 0;
  for (const x of String(texto).matchAll(/[\p{L}\p{N}%]+/gu)) {
    const rw = raiz(normalizar(x[0]).replace(/\s/g, ""));
    if (!termos.some((t) => rw.startsWith(t))) continue;
    if (x.index > ult) out.push({ t: texto.slice(ult, x.index), m: false });
    out.push({ t: x[0], m: true });
    ult = x.index + x[0].length;
  }
  if (ult < texto.length) out.push({ t: texto.slice(ult), m: false });
  return out;
}

// ---------- laudos parecidos ----------
export function parecidos(alvo, ixs, n = 5) {
  const a = new Set(alvo.feat);
  if (!a.size) return [];
  const out = [];
  for (const ix of ixs) {
    if (ix.r.acc === alvo.r.acc) continue;
    const b = new Set(ix.feat);
    let inter = 0;
    for (const x of b) if (a.has(x)) inter++;
    if (!inter) continue;
    const s = inter / (a.size + b.size - inter) + (ix.exame === alvo.exame ? 0.25 : 0);
    out.push([s, ix]);
  }
  return out.sort((x, y) => y[0] - x[0]).slice(0, n).map((x) => x[1]);
}

// ---------- estatísticas ----------
export function estatisticas(lista) {
  const conta = (fn) => { const m = new Map(); for (const ix of lista) for (const v of fn(ix)) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const meses = conta((ix) => [String(ix.r.data || "").slice(0, 7)]).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    total: lista.length, normais: lista.filter((ix) => ix.r.normal).length,
    meses, mod: conta((ix) => [ix.mod]), medico: conta((ix) => [ix.medico]), achado: conta((ix) => ix.achadosEtq),
    classe: conta((ix) => ix.classes), exame: conta((ix) => [ix.exame]),
  };
}
