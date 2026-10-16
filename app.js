// App Banco de laudos: a página Banco da extensão Copiar Laudos Vue, fora do Chrome do PC.
// Dados no IndexedDB deste aparelho, sincronizados com o Google Drive (nuvem.js + drive.js) e, nos PCs com a extensão,
// com o banco dela (ponte.js). Busca com a mesma sintaxe dos filtros do painel; sem tokens de IA.
import CONFIG from "./config.js";
import * as db from "./lib/db.js";
import { sincronizar, imagemDe } from "./lib/nuvem.js";
import * as drive from "./lib/drive.js";
import { comExtensao, procurarExtensao, extensao } from "./lib/ponte.js";
import { camposDaEdicao, recalculo } from "./lib/regras.js";
import { confere, textoDoExame } from "./lib/filtros.js";
import { medicoConfere, abreviarTitulo, separarLinhas, textoDoParagrafo } from "./lib/laudo2notion.js";
import { dividirLaudo, resumoLaudo, itensConclusao, destacarConclusao, cabecalho } from "./lib/secoes.js";

const lerLocal = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
drive.configurar(lerLocal("app.clienteId", "") || CONFIG.clienteId);
drive.prepararLogin();

// registros antigos não têm resumo/conclusão numerada guardados: calcula na hora a partir do laudo
function completar(r) {
  if (r.__ok) return r;
  const div = dividirLaudo(r.pars || []);
  r.titulo = abreviarTitulo(r.titulo);
  r.resumo = r.resumo || resumoLaudo(div);
  r.itensConc = itensConclusao(div);
  if (!r.itensConc.length) r.itensConc = String(r.conclusao || "").split("\n").map((s) => s.replace(/^\s*\d{1,2}\s*[).\-–:]\s*/, "").trim()).filter(Boolean);
  r.concPars = div.secoes.conclusao || [];
  r.concSet = new Set(r.concPars);
  r.__ok = true;
  return r;
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const msg = (t) => { $("msg").textContent = t; };
const POR_PAGINA = 50;
let achados = [];
let mostrando = 0;
const urls = [];
let MOSTRAR_RESUMO = lerLocal("app.mostrarResumo", false);

const CAMPOS = ["fTexto", "fExame", "fMedico", "fDe", "fAte", "fNormal"];
const lerFiltros = () => Object.fromEntries(CAMPOS.map((id) => [id, $(id).value.trim()]));
{ const f = lerLocal("banco.filtros", {}); for (const id of CAMPOS) if (f[id] != null) $(id).value = f[id]; }

function passa(r, f) {
  if (f.fDe && r.data < f.fDe) return false;
  if (f.fAte && r.data > f.fAte) return false;
  if (f.fNormal === "alt" && r.normal) return false;
  if (f.fNormal === "normal" && !r.normal) return false;
  if (f.fExame && !confere(f.fExame, textoDoExame(r.desc, r.mod, r.titulo))) return false;
  if (f.fMedico && !medicoConfere(f.fMedico, r.medico)) return false;
  if (f.fTexto && !confere(f.fTexto, r.texto || "", { ignorarNegados: true, sinonimos: true })) return false;
  return true;
}

async function buscar() {
  const f = lerFiltros();
  gravarLocal("banco.filtros", f);
  for (const u of urls.splice(0)) URL.revokeObjectURL(u);
  achados = [];
  const meds = new Map();
  let total = 0;
  await db.percorrer((r) => {
    total++;
    if (r.medico) meds.set(r.medico, (meds.get(r.medico) || 0) + 1);
    if (passa(r, f)) achados.push(r);
  });
  $("listaMedicos").innerHTML = [...meds].sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `<option value="${esc(m)}">${n} laudo(s)</option>`).join("");
  $("resumo").textContent = `${achados.length} de ${total} laudo(s)`;
  mostrando = 0;
  $("lista").innerHTML = "";
  if (!total) {
    $("lista").innerHTML = drive.conectado() || extensao()
      ? '<div class="vazio">O banco ainda está vazio. Toque em <b>⇅ Sincronizar</b>.</div>'
      : '<div class="vazio">O banco deste aparelho está vazio.<br>Toque em <b>⚙</b> › <b>Conectar ao Google Drive</b> para trazer os laudos.</div>';
    return;
  }
  if (!achados.length) { $("lista").innerHTML = '<div class="vazio">Nenhum laudo com esses filtros.</div>'; return; }
  mostrarMais();
}

const semNum = (p) => (p.length ? [{ ...p[0], t: p[0].t.replace(/^\s*\d{1,2}\s*[).\-–:]\s*/, "") }, ...p.slice(1)] : p);
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "?");
const htmlPar = (p) => p.map(({ t, b, i, u }) => {
  let x = esc(t);
  if (u) x = `<u>${x}</u>`;
  if (i) x = `<i>${x}</i>`;
  if (b) x = `<b>${x}</b>`;
  return x;
}).join("");
const fmtConc = (r, p) => htmlPar(r.destaqueManual ? semNum(p) : destacarConclusao(semNum(p)));

function cartao(r) {
  completar(r);
  const conc = r.concPars.length ? r.concPars.map((p) => fmtConc(r, p)) : r.itensConc.map((c) => htmlPar(destacarConclusao([{ t: c }])));
  return `<div class="item ${r.normal ? "normal" : ""}" data-acc="${esc(r.acc)}">
    <div class="cab" title="Toque para abrir o laudo completo"><span class="acc">${esc(r.acc)}</span><span class="data">${dataBr(r.data)}</span>${esc(r.titulo)}<button class="lixo" data-acao="apagar" title="Apagar">🗑</button></div>
    <div class="sub">${[esc(r.medico || ""), esc([r.sexo, r.idade != null ? r.idade + " anos" : ""].filter(Boolean).join(", ")),
      r.nImagens ? `🖼 ${r.nImagens}` : "", r.indicacao ? `Indicação: ${esc(r.indicacao)}` : ""].filter(Boolean).join(" · ")}</div>
    ${MOSTRAR_RESUMO ? `<div class="resumo" contenteditable="true" data-campo="resumo" title="Toque para editar (em branco = automático)">${esc(r.resumo || "")}</div>` : ""}
    <ol class="conc" contenteditable="true" data-campo="conc" title="Toque para editar">${conc.map((c) => `<li>${c}</li>`).join("")}</ol>
    <div class="aberto"></div>
  </div>`;
}

function mostrarMais() {
  $("lista").querySelector(".mais")?.remove();
  const prox = achados.slice(mostrando, mostrando + POR_PAGINA);
  $("lista").insertAdjacentHTML("beforeend", prox.map(cartao).join(""));
  mostrando += prox.length;
  if (mostrando < achados.length) $("lista").insertAdjacentHTML("beforeend", `<button class="mais">Mostrar mais (${achados.length - mostrando})</button>`);
}

async function abrir(item) {
  const box = item.querySelector(".aberto");
  if (box.innerHTML) { box.innerHTML = ""; return; }
  const r = achados.find((x) => x.acc === item.dataset.acc);
  if (!r) return;
  completar(r);
  let html = "", lista = [];
  const fecharLista = () => { if (lista.length) html += `<ol>${lista.map((p) => `<li>${fmtConc(r, p)}</li>`).join("")}</ol>`; lista = []; };
  for (const p of r.pars || []) { if (r.concSet.has(p)) lista.push(p); else { fecharLista(); html += `<p>${htmlPar(p)}</p>`; } }
  fecharLista();
  const n = Math.max(r.nImagens || 0, r.imgs?.length || 0, r.imgsLocais || 0);
  box.innerHTML = `<div class="laudo">${html}</div>
    ${n ? `<div class="imgs">${Array.from({ length: n }, (_, i) => `<div class="carregando" data-i="${i}">imagem ${i + 1}…</div>`).join("")}</div>` : ""}
    <div class="acoes"><button data-acao="editar">✎ Editar</button><button data-acao="copiar">Copiar texto</button>${r.notionId && r.notionPagina
      ? `<button data-acao="notion" title="Abre este laudo na página do Notion">Notion ↗</button>` : ""}<button data-acao="apagar">Apagar</button></div>`;
  // imagens: do cache deste aparelho ou baixadas do Drive (precisa estar conectado)
  for (let i = 0; i < n; i++) {
    const lugar = box.querySelector(`.carregando[data-i="${i}"]`);
    if (!lugar) break;
    try {
      const b = await imagemDe(drive.conectado() ? drive.adaptador : null, r, i);
      if (!b) { lugar.textContent = drive.conectado() ? "sem imagem" : "conecte ao Drive"; continue; }
      const u = URL.createObjectURL(b);
      urls.push(u);
      lugar.outerHTML = `<img src="${u}" alt="imagem chave">`;
    } catch (e) { lugar.textContent = e.login ? "conecte ao Drive" : "erro"; }
  }
}

$("lista").addEventListener("click", async (e) => {
  if (e.target.classList.contains("mais")) return mostrarMais();
  const item = e.target.closest(".item");
  if (!item) return;
  if (e.target.tagName === "IMG") { $("zoom").querySelector("img").src = e.target.src; $("zoom").style.display = "flex"; return; }
  const acao = e.target.closest("[data-acao]")?.dataset.acao;
  const r = achados.find((x) => x.acc === item.dataset.acc);
  if (acao === "copiar" && r) {
    const txt = [r.titulo, `Acesso ${r.acc} · ${dataBr(r.data)} · ${r.medico || ""}`, "", ...(r.pars || []).map((p) => p.map((s) => s.t).join(""))].join("\n");
    try { await navigator.clipboard.writeText(txt); msg("Laudo copiado"); } catch { msg("Não consegui copiar"); }
    return;
  }
  if (acao === "editar" && r) return editar(item, r);
  if (acao === "salvar" && r) return salvar(item, r);
  if (acao === "cancelar" && r) { item.querySelector(".aberto").innerHTML = ""; return abrir(item); }
  if (acao === "notion" && r) {
    window.open(`https://www.notion.so/${String(r.notionPagina).replace(/-/g, "")}#${String(r.notionId).replace(/-/g, "")}`, "_blank");
    return;
  }
  if (acao === "apagar" && r) {
    if (!confirm(`Apagar o acesso ${r.acc}?\n(sai deste banco em todos os aparelhos e do banco da extensão; o Notion não muda)`)) return;
    await apagarDoBanco([r]);
    item.remove();
    msg(`Acesso ${r.acc} apagado`);
    return;
  }
  if (e.target.closest(".cab")) abrir(item);
});
$("zoom").addEventListener("click", () => { $("zoom").style.display = "none"; });

// ---------- edição direta no cartão (conclusão e resumo) ----------
// Ctrl+B negrito, Ctrl+S sublinhado (Ctrl+U também); no celular, a barrinha de baixo. Salva ao sair do campo.
$("lista").addEventListener("keydown", (e) => {
  if (!e.target.isContentEditable || !e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === "s" || k === "u") { e.preventDefault(); document.execCommand("underline"); }
  else if (k === "b") { e.preventDefault(); document.execCommand("bold"); }
  else if (k === "i") { e.preventDefault(); document.execCommand("italic"); }
});
$("fmt").addEventListener("mousedown", (e) => e.preventDefault());       // não tira o foco do texto
$("fmt").addEventListener("touchstart", (e) => { const b = e.target.closest("[data-fmt]"); if (b) { e.preventDefault(); document.execCommand(b.dataset.fmt); } }, { passive: false });
$("fmt").addEventListener("click", (e) => { const b = e.target.closest("[data-fmt]"); if (b) document.execCommand(b.dataset.fmt); });
$("lista").addEventListener("focusin", (e) => {
  if (e.target.isContentEditable) $("fmt").style.display = "flex";
  const el = e.target.closest?.("[data-campo]");
  if (el && el.dataset.orig == null) el.dataset.orig = el.innerHTML;
});
$("lista").addEventListener("focusout", async (e) => {
  setTimeout(() => { if (!document.activeElement?.isContentEditable) $("fmt").style.display = "none"; }, 50);
  const el = e.target.closest?.("[data-campo]");
  if (!el || el.dataset.orig == null || el.innerHTML === el.dataset.orig) return;
  const item = el.closest(".item");
  const r = achados.find((x) => x.acc === item?.dataset.acc);
  if (!r) return;
  el.dataset.orig = el.innerHTML;
  completar(r);
  let pars = r.pars || [], resumo = r.resumoManual ? r.resumo : "";
  if (el.dataset.campo === "resumo") resumo = el.textContent.trim();
  else pars = trocarConclusao(r, lerEditado(Object.assign(document.createElement("div"), { innerHTML: `<ol>${el.innerHTML}</ol>` })));
  await salvarEdicao(r, pars, resumo, el.dataset.campo === "conc" || !!r.destaqueManual);
  msg(`Acesso ${r.acc} salvo`);
  item.querySelector(".aberto").innerHTML = "";
});

async function salvarEdicao(r, pars, resumo, destaqueManual = true) {
  const atual = await db.laudo(r.acc);
  if (!atual) throw new Error("laudo não encontrado");
  await db.atualizar(r.acc, camposDaEdicao(atual, pars, resumo, destaqueManual));
  const novo = await db.laudo(r.acc);
  const i = achados.indexOf(r);
  if (novo && i >= 0) achados[i] = novo;
  agendarSincronia();
  return novo;
}

// os parágrafos da conclusão no laudo são trocados pelos editados (no mesmo lugar)
function trocarConclusao(r, itens) {
  const fora = new Set(r.concPars || []);
  const cabConc = () => [{ t: "Conclusão:", b: true, i: false, u: false }];
  const out = [];
  let ins = -1, depoisCab = -1;
  for (const p of r.pars || []) {
    if (fora.has(p)) { if (ins < 0) ins = out.length; continue; }
    const cab = cabecalho(textoDoParagrafo(p));
    if (cab?.chave === "conclusao") { out.push(cab.resto ? cabConc() : p); depoisCab = out.length; continue; }
    out.push(p);
  }
  if (ins < 0) ins = depoisCab >= 0 ? depoisCab : (out.push(cabConc()), out.length);
  out.splice(ins, 0, ...itens);
  return out;
}

// ---------- editar o laudo ----------
function editar(item, r) {
  const box = item.querySelector(".aberto");
  const laudoEl = box.querySelector(".laudo");
  if (!laudoEl) return;
  laudoEl.contentEditable = "true";
  laudoEl.classList.add("editando");
  laudoEl.focus();
  box.querySelector(".acoes").innerHTML = `<label class="rotres">Resumo (deixe em branco para o automático)
      <input class="edResumo" value="${esc(r.resumoManual ? r.resumo : "")}" placeholder="${esc(r.resumo || "")}"></label>
    <button data-acao="salvar">Salvar</button><button data-acao="cancelar">Cancelar</button>`;
  msg("Editando — Ctrl+B negrito, Ctrl+I itálico, Ctrl+U sublinhado");
}

// HTML editado -> parágrafos {t, b, i, u}; itens de lista numerada viram "1. ...", "2. ..."
function lerEditado(el) {
  const pars = [];
  const trechos = (no, f, out) => {
    if (no.nodeType === 3) { if (no.nodeValue) out.push({ t: no.nodeValue.replace(/ /g, " "), ...f }); return; }
    if (no.nodeType !== 1) return;
    const tag = no.tagName, st = no.style || {};
    const g = { b: f.b || tag === "B" || tag === "STRONG" || +st.fontWeight >= 600 || st.fontWeight === "bold",
      i: f.i || tag === "I" || tag === "EM" || st.fontStyle === "italic", u: f.u || tag === "U" || /underline/.test(st.textDecoration || "") };
    if (tag === "BR") { out.push({ t: "\n", ...f }); return; }
    for (const c of no.childNodes) trechos(c, g, out);
  };
  const bloco = (no, prefixo = "") => {
    const out = [];
    trechos(no, { b: false, i: false, u: false }, out);
    if (prefixo && out.length) out[0] = { ...out[0], t: prefixo + out[0].t.replace(/^\s+/, "") };
    pars.push(...separarLinhas([out.filter((s) => s.t)]));
  };
  for (const no of el.childNodes) {
    if (no.nodeType === 1 && (no.tagName === "OL" || no.tagName === "UL")) {
      [...no.children].forEach((li, i) => bloco(li, no.tagName === "OL" ? `${i + 1}. ` : "• "));
    } else if (no.nodeType === 3 && !no.nodeValue.trim()) continue;
    else bloco(no);
  }
  return pars;
}

async function salvar(item, r) {
  const box = item.querySelector(".aberto");
  const pars = lerEditado(box.querySelector(".laudo"));
  if (!pars.length) return msg("O laudo ficou vazio — nada foi salvo");
  const resumo = box.querySelector(".edResumo")?.value || "";
  const novo = await salvarEdicao(r, pars, resumo, !!r.destaqueManual);
  const tmp = document.createElement("div");
  tmp.innerHTML = cartao(novo || r);
  const el = tmp.firstElementChild;
  item.replaceWith(el);
  abrir(el);
  msg("Laudo salvo");
}

// apagar = lápide: a exclusão chega ao Drive, aos outros aparelhos e ao banco da extensão
async function apagarDoBanco(regs) {
  const agora = Date.now();
  for (const r of regs) {
    const l = await db.laudo(r.acc);
    await db.apagarImagens(r.acc, Math.max(l?.nImagens || 0, l?.imgsLocais || 0));
    await db.salvar({ acc: r.acc, data: r.data, apagado: true, mudadoEm: agora, nuvemEm: l?.nuvemEm ?? null });
  }
  const fora = new Set(regs);
  const antes = achados.length;
  achados = achados.filter((x) => !fora.has(x));
  mostrando = Math.max(0, mostrando - (antes - achados.length));
  agendarSincronia();
}
async function apagarFiltrados() {
  if (!achados.length) return msg("Nenhum laudo na busca atual");
  const n = achados.length;
  if (!confirm(`Apagar os ${n} laudo(s) da busca atual?\n(de todos os aparelhos e do banco da extensão; o Notion não muda)`)) return;
  if (n > 20 && prompt(`São ${n} laudos. Para confirmar, digite APAGAR`) !== "APAGAR") return msg("Nada foi apagado");
  await apagarDoBanco([...achados]);
  msg(`${n} laudo(s) apagado(s)`);
  buscar();
}
$("bApagarFiltrados").addEventListener("click", apagarFiltrados);
$("oApagar").addEventListener("click", () => { $("dOpcoes").close(); apagarFiltrados(); });

// resumos no formato atual (RESUMO_VERSAO de lib/secoes.js)
async function refazerResumos(forcar) {
  if (forcar) msg("Refazendo resumos...");
  let mudaram = 0;
  for (const r of await db.todos()) {
    if (r.apagado) continue;
    const c = recalculo(r, forcar);
    if (!c) continue;
    if (["resumo", "conclusao", "titulo", "pars"].some((k) => k in c && JSON.stringify(c[k]) !== JSON.stringify(r[k]))) mudaram++;
    await db.atualizar(r.acc, c);
  }
  if (mudaram) { msg(`Resumos atualizados em ${mudaram} laudo(s)`); buscar(); }
  else if (forcar) msg("Os resumos já estão no formato atual");
}
$("bRefazer").addEventListener("click", () => refazerResumos(true));
$("oRefazer").addEventListener("click", () => { $("dOpcoes").close(); refazerResumos(true); });

// ---------- sincronização ----------
let sincronizando = false;
async function sincronizarTudo({ manual = false } = {}) {
  if (sincronizando) return;
  sincronizando = true;
  const partes = [];
  try {
    if (await procurarExtensao()) {
      const x = await comExtensao(undefined, msg);
      if (x.trazidos) partes.push(`${x.trazidos} da extensão`);
      if (x.levados || x.apagadosLa) partes.push(`${x.levados + x.apagadosLa} para a extensão`);
    }
    if (!drive.conectado() && manual && drive.configurado()) await drive.conectar();
    if (drive.conectado()) {
      const n = await sincronizar(drive.adaptador, msg);
      if (n.recebidos) partes.push(`${n.recebidos} recebido(s)`);
      if (n.enviados) partes.push(`${n.enviados} enviado(s)`);
      if (n.imagens) partes.push(`${n.imagens} imagem(ns) enviada(s)`);
      if (extensao() && n.recebidos) { const x = await comExtensao(undefined, msg); if (x.levados) partes.push(`${x.levados} para a extensão`); }
    }
    msg(partes.length ? `Sincronizado: ${partes.join(", ")}` : drive.conectado() ? "Tudo sincronizado" : "");
    if (partes.length) { await refazerResumos(false); buscar(); }
  } catch (e) {
    msg(e.login ? "Conecte ao Google Drive (⇅ ou ⚙)" : `Não consegui sincronizar: ${e.message}`);
  } finally {
    sincronizando = false;
    estadoNuvem();
  }
}
let tempoSinc = null;
function agendarSincronia() {
  clearTimeout(tempoSinc);
  tempoSinc = setTimeout(() => sincronizarTudo(), 4000);
}
$("bNuvem").addEventListener("click", () => sincronizarTudo({ manual: true }));

function estadoNuvem() {
  const precisa = drive.configurado() && !drive.conectado();
  $("bNuvem").classList.toggle("alerta", precisa);
  $("bNuvem").textContent = precisa ? "☁ Conectar e sincronizar" : "⇅ Sincronizar";
}

// ---------- configurações ----------
$("bOpcoes").addEventListener("click", async () => {
  $("oResumo").checked = MOSTRAR_RESUMO;
  $("oCliente").value = lerLocal("app.clienteId", "");
  const meta = await db.lerMeta("nuvem", {});
  let total = 0, pend = 0;
  for (const r of await db.todos()) { if (!r.apagado) total++; if (r.nuvemEm !== r.mudadoEm) pend++; }
  let espaco = "";
  try { const e = await navigator.storage.estimate(); espaco = `${(e.usage / 1048576).toFixed(1)} MB usados neste aparelho`; } catch {}
  $("estado").innerHTML = [
    `<b>Google Drive:</b> ${!drive.configurado() ? "falta o ID do cliente OAuth" : drive.conectado() ? "conectado" : "desconectado"}`,
    `<b>Última sincronização:</b> ${meta.ultima ? new Date(meta.ultima).toLocaleString("pt-BR") : "nunca"}`,
    `<b>Laudos aqui:</b> ${total}${pend ? ` · ${pend} para enviar` : ""}`,
    `<b>Extensão Copiar Laudos Vue:</b> ${extensao() ? `encontrada (v${extensao()})` : "não está neste navegador"}`,
    espaco,
  ].filter(Boolean).join("<br>");
  $("dOpcoes").showModal();
});
$("oFechar").addEventListener("click", () => $("dOpcoes").close());
$("oResumo").addEventListener("change", () => { MOSTRAR_RESUMO = $("oResumo").checked; gravarLocal("app.mostrarResumo", MOSTRAR_RESUMO); buscar(); });
$("oCliente").addEventListener("change", () => {
  const v = $("oCliente").value.trim();
  gravarLocal("app.clienteId", v);
  drive.configurar(v || CONFIG.clienteId);
  drive.prepararLogin();
  estadoNuvem();
});
$("oConectar").addEventListener("click", async () => {
  try { await drive.conectar(); $("dOpcoes").close(); sincronizarTudo(); }
  catch (e) { alert("Não conectou: " + e.message); }
});
$("oDesconectar").addEventListener("click", () => { drive.desconectar(); $("dOpcoes").close(); estadoNuvem(); msg("Desconectado do Google Drive"); });

// ---------- filtros ----------
let tempo = null;
for (const id of CAMPOS) $(id).addEventListener(["fTexto", "fExame", "fMedico"].includes(id) ? "input" : "change", () => {
  clearTimeout(tempo);
  tempo = setTimeout(buscar, 350);
});
$("bLimpar").addEventListener("click", () => { for (const id of CAMPOS) $(id).value = ""; buscar(); });
$("bFiltros").addEventListener("click", () => $("topo").classList.toggle("abertos"));

// ---------- início ----------
estadoNuvem();
await buscar();
await refazerResumos(false);
sincronizarTudo();
// volta a sincronizar a cada 5 min e quando o app volta para a frente
setInterval(() => { if (document.visibilityState === "visible") sincronizarTudo(); }, 5 * 60e3);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizarTudo(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
