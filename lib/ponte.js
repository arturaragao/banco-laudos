// Ponte com a extensão Copiar Laudos Vue (só nos PCs onde ela está instalada; o ponte.js dela entra nesta página).
// Traz para o app os laudos que a extensão copiou do portal (com as imagens) e leva para ela as edições e exclusões feitas
// no app (de lá vão ao Notion, se a sincronização com o Notion estiver ligada). Vale o conteúdo mudado por último.
import * as db from "./db.js";
import { conteudoDe, ANOTACOES } from "./nuvem.js";

const DE_APP = "banco-laudos-app", DE_EXT = "copiar-laudos-vue";
export const CAMPOS_EDITAVEIS = ["pars", "texto", "normal", "etiquetas", "indicacao", "conclusao", "resumo", "resumoManual", "resumoManualEm",
  "resumoVersao", "destaqueManual"];

// ---------- conversa com a extensão (window.postMessage) ----------
let versaoExt = "";
const esperando = new Map();
let seq = 0;
if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.de !== DE_EXT) return;
    if (e.data.tipo === "pronta") versaoExt = e.data.versao || "?";
    else if (e.data.id && esperando.has(e.data.id)) { esperando.get(e.data.id)(e.data.resposta); esperando.delete(e.data.id); }
  });
}
export const extensao = () => versaoExt;
export async function procurarExtensao(ms = 700) {
  if (versaoExt) return true;
  window.postMessage({ de: DE_APP, tipo: "ola" }, location.origin);
  await new Promise((r) => setTimeout(r, ms));
  return !!versaoExt;
}
export function pedirExtensao(pedido) {
  return new Promise((ok, falha) => {
    const id = ++seq;
    const t = setTimeout(() => { esperando.delete(id); falha(new Error("a extensão não respondeu")); }, 120e3);
    esperando.set(id, (r) => { clearTimeout(t); r?.ok ? ok(r) : falha(new Error(r?.erro || "erro na extensão")); });
    window.postMessage({ de: DE_APP, id, pedido }, location.origin);
  });
}

async function dataUrlParaBlob(u) { return (await fetch(u)).blob(); }
const blocos = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ---------- sincronização app <-> extensão ----------
// pedir(pedido) -> resposta (injetável para os testes)
export async function comExtensao(pedir = pedirExtensao, aviso = () => {}) {
  aviso("Conferindo o banco da extensão...");
  const { laudos, apagados = [] } = await pedir({ op: "listar" });
  const locais = new Map((await db.todos()).map((r) => [r.acc, r]));
  const trazer = [], levar = [], apagarLa = {};
  for (const x of laudos) {
    const l = locais.get(x.acc);
    const m = l ? conteudoDe(l) : 0;          // momento em que o CONTEÚDO mudou (favorito/nota não contam)
    if (!l || x.em > m) trazer.push(x.acc);
    else if (l.apagado) apagarLa[x.acc] = m;
    else if (m > x.em) levar.push(l);
  }
  // apagados na página Banco da extensão: viram lápide aqui (só os que ainda não foram vistos)
  const vistos = new Set(await db.lerMeta("apagadosExtVistos", []));
  const naExt = new Set(laudos.map((x) => x.acc));
  let apagadosAqui = 0;
  for (const acc of apagados) {
    if (vistos.has(acc)) continue;
    vistos.add(acc);
    const l = locais.get(acc);
    if (!l || l.apagado || naExt.has(acc)) continue;
    await db.apagarImagens(acc, Math.max(l.nImagens || 0, l.imgsLocais || 0));
    await db.salvar({ acc, data: l.data, apagado: true, mudadoEm: Date.now(), nuvemEm: l.nuvemEm, apagarImgs: l.imgs || [] });
    apagadosAqui++;
  }
  await db.gravarMeta("apagadosExtVistos", [...vistos]);

  let trazidos = 0, imagens = 0;
  for (const lote of blocos(trazer, 50)) {
    const { laudos: regs } = await pedir({ op: "laudos", accs: lote });
    for (const r of regs) {
      const l = locais.get(r.acc);
      const n = r.nImagens || 0;
      const agora = Date.now();
      const novo = { ...r, apagado: false, conteudoMudadoEm: r.mudadoEm, mudadoEm: Math.max(agora, (l?.mudadoEm || 0) + 1), nuvemEm: l?.nuvemEm ?? null, imgs: l?.imgs?.length <= n ? l.imgs : [], imgsLocais: Math.min(l?.imgsLocais || 0, n) };
      delete novo.salvoEm;
      // favorito, coleções, nota e lixeira são do app: ficam
      for (const k of ANOTACOES) { if (l && !l.apagado && k in l) novo[k] = l[k]; else delete novo[k]; }
      novo.anotEm = l && !l.apagado ? l.anotEm || 0 : 0;
      if (n && novo.imgs.length < n && novo.imgsLocais < n) {
        const { imagens: urls = [] } = await pedir({ op: "imagens", acc: r.acc });
        let k = 0;
        for (const u of urls) { if (!u) break; await db.guardarImagem(r.acc, k++, await dataUrlParaBlob(u)); }
        novo.imgsLocais = k;
        imagens += k;
      }
      await db.salvar(novo);
      trazidos++;
      aviso(`Trazendo da extensão: ${trazidos} de ${trazer.length}...`);
    }
  }
  let levados = 0;
  for (const lote of blocos(levar, 50)) {
    const { em = {} } = await pedir({
      op: "gravar",
      laudos: lote.map((l) => ({ acc: l.acc, mudadoEm: conteudoDe(l), campos: Object.fromEntries(CAMPOS_EDITAVEIS.filter((k) => k in l).map((k) => [k, l[k]])) })),
    });
    for (const [acc, m] of Object.entries(em)) { await db.atualizar(acc, { conteudoMudadoEm: m, mudadoEm: Date.now() }); levados++; }
  }
  const nApagar = Object.keys(apagarLa).length;
  if (nApagar) await pedir({ op: "apagar", accs: Object.keys(apagarLa), em: apagarLa });
  return { trazidos, imagens, levados, apagadosLa: nApagar, apagadosAqui };
}
