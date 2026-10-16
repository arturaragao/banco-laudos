// App Banco de laudos: a página Banco da extensão Copiar Laudos Vue, fora do Chrome do PC, com filtros por facetas.
// Dados no IndexedDB deste aparelho, sincronizados com o Google Drive (nuvem.js + drive.js) e, nos PCs com a extensão,
// com o banco dela (ponte.js). Tudo por regras, sem tokens de IA.
import CONFIG from "./config.js";
import * as db from "./lib/db.js";
import * as prefs from "./lib/prefs.js";
import { sincronizar, imagemDe } from "./lib/nuvem.js";
import * as drive from "./lib/drive.js";
import { comExtensao, procurarExtensao, extensao } from "./lib/ponte.js";
import { camposDaEdicao, recalculo } from "./lib/regras.js";
import { indexar, padronizar, filtrar, ordenar, termosPositivos, marcar, parecidos, estatisticas } from "./lib/indice.js";
import { destacar } from "./lib/destaque.js";
import { vocabulario, corrigir } from "./lib/aproximada.js";
import { abreviarTitulo, separarLinhas, textoDoParagrafo } from "./lib/laudo2notion.js";
import { dividirLaudo, resumoLaudo, itensConclusao, cabecalho } from "./lib/secoes.js";
// grupos de filtro que aparecem ("achado" fica guardado, escondido a pedido do Artur em 16/10/2026)
const GRUPOS = ["mod", "exame", "medico", "classe", "colecao"];
import { abrirVisor, visorAberto, fecharVisor } from "./ui/visor.js";

const $ = (id) => document.getElementById(id);
const lerLocal = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const msg = (t) => { $("aviso").dataset.msg = t || ""; mostrarAviso(); };
const DIA = 864e5, LIXEIRA_DIAS = 30, POR_PAGINA = 40;
drive.configurar(lerLocal("app.clienteId", "") || CONFIG.clienteId);
drive.prepararLogin();

// ---------- estado ----------
const PADRAO = { q: "", onde: "tudo", periodo: "", de: "", ate: "", normal: "", fav: false, img: false, ordem: "recente", facetas: {} };
let F = { ...PADRAO, ...lerLocal("banco.f", {}), img: false };
let vista = "laudos";                       // laudos | lixeira
let estudo = lerLocal("app.estudo", false);
let MOSTRAR_RESUMO = lerLocal("app.mostrarResumo", false);
let todos = [];                             // ix de todos os laudos (sem lápides)
let achados = [];                           // ix da busca atual
let mostrando = 0, termos = [], consultaUsada = "";
let vocab = null;
let P = prefs.vazio();
const abertos = new Set();                  // grupos de facetas expandidos
const urls = [];

// ---------- carregar ----------
async function carregar() {
  const regs = [];
  await db.percorrer((r) => { regs.push(r); });
  todos = padronizar(regs.map(indexar));
  vocab = null;
  P = await prefs.ler();
  $("historico").innerHTML = Object.entries(P.historico).sort((a, b) => b[1].em - a[1].em).map(([t]) => `<option value="${esc(t)}">`).join("");
}

function dataMenos(dias) { const d = new Date(Date.now() - dias * DIA); return d.toISOString().slice(0, 10); }
function filtroEfetivo() {
  const f = { ...F };
  const dias = { hoje: 0, "3d": 2, "7d": 6, "30d": 29, "3m": 91, "12m": 365 }[F.periodo];
  if (dias != null) { f.de = dataMenos(dias); f.ate = ""; }
  else if (F.periodo !== "datas") { f.de = ""; f.ate = ""; }
  return f;
}

// ---------- buscar ----------
let tempoHist = null;
async function buscar() {
  gravarLocal("banco.f", F);
  for (const u of urls.splice(0)) URL.revokeObjectURL(u);
  const q = F.q.trim();
  let trocas = [];
  consultaUsada = q;
  if (q && !/^\d{5,}$/.test(q)) {
    vocab ||= vocabulario(todos.map((ix) => ix.tudo));
    const c = corrigir(q, vocab);
    if (c.trocas.length) { consultaUsada = c.expr; trocas = c.trocas; }
  }
  termos = /^\d{5,}$/.test(q) ? [] : termosPositivos(consultaUsada);
  const base = todos.filter((ix) => (vista === "lixeira" ? ix.r.lixeiraEm : !ix.r.lixeiraEm));
  const { lista, contagens } = filtrar(base, filtroEfetivo(), consultaUsada);
  achados = ordenar(lista, F.ordem, consultaUsada, base);
  $("aviso").dataset.troca = trocas.length ? `Busquei por <b>${esc(consultaUsada)}</b> (você digitou ${trocas.map(([a]) => `“${esc(a)}”`).join(", ")})` : "";
  mostrarAviso();
  desenharTopo();
  desenharFacetas(contagens);
  desenharFaixa();
  const total = base.length;
  $("contagem").textContent = vista === "lixeira" ? `lixeira: ${achados.length}` : `${achados.length} de ${total} laudo(s)`;
  mostrando = 0;
  $("lista").innerHTML = "";
  if (!todos.length) {
    $("lista").innerHTML = drive.conectado() || extensao()
      ? '<div class="vazio">O banco ainda está vazio. Toque em <b>⇅ Sincronizar</b>.</div>'
      : '<div class="vazio">O banco deste aparelho está vazio.<br>Toque em <b>☁ Conectar e sincronizar</b> para trazer os laudos do Google Drive.</div>';
  } else if (!achados.length) {
    $("lista").innerHTML = `<div class="vazio">${vista === "lixeira" ? "A lixeira está vazia." : "Nenhum laudo com esses filtros."}</div>`;
  } else mostrarMais();
  // histórico de buscas (vai para os outros aparelhos)
  clearTimeout(tempoHist);
  if (q && achados.length && !/^\d{5,}$/.test(q)) tempoHist = setTimeout(async () => {
    if (P.historico[q] && Date.now() - P.historico[q].em < 60e3) return;
    P = await prefs.mudar("historico", q, {});
    $("historico").innerHTML = Object.entries(P.historico).sort((a, b) => b[1].em - a[1].em).map(([t]) => `<option value="${esc(t)}">`).join("");
  }, 2500);
}

function mostrarAviso() {
  const a = $("aviso");
  a.innerHTML = [a.dataset.troca, esc(a.dataset.msg || "")].filter(Boolean).join(" · ");
}

function desenharTopo() {
  $("q").value !== F.q && ($("q").value = F.q);
  $("onde").value = F.onde;
  $("ordem").value = F.ordem;
  document.querySelectorAll("[data-periodo]").forEach((b) => b.classList.toggle("on", b.dataset.periodo === F.periodo || (b.dataset.periodo === "" && !F.periodo)));
  $("pFav").classList.toggle("on", !!F.fav);
  const n = GRUPOS.reduce((s, g) => s + (F.facetas[g]?.length || 0), 0) + (F.normal ? 1 : 0) + (F.periodo === "datas" ? 1 : 0);
  $("bFiltros").textContent = n ? `Filtros (${n})` : "Filtros";
  $("bFiltros").classList.toggle("on", n > 0);
}

const NOMES = { mod: "Modalidade", exame: "Exame", medico: "Médico", classe: "Classificações", achado: "Achados", colecao: "Coleções" };
function desenharFacetas(cont) {
  const chips = (g) => {
    const sel = F.facetas[g] || [];
    const itens = [...cont[g]];
    for (const v of sel) if (!itens.some(([x]) => x === v)) itens.unshift([v, 0]);
    if (!itens.length) return "";
    const lim = abertos.has(g) ? itens.length : 8;
    return `<div class="grupo"><h3>${NOMES[g]}${itens.length > 8 ? `<button class="mais" data-expandir="${g}">${abertos.has(g) ? "menos" : `todos (${itens.length})`}</button>` : ""}</h3>
      <div class="chips">${itens.slice(0, lim).map(([v, n]) => `<button class="chip ${sel.includes(v) ? "on" : ""}" data-g="${g}" data-v="${esc(v)}"><span class="nome">${esc(v)}</span><span>${n}</span></button>`).join("")}</div></div>`;
  };
  const salvas = prefs.ativos(P, "buscas");
  $("facetas").innerHTML = `
    <div class="grupo"><h3>Buscas salvas <button class="mais" id="bSalvarBusca">★ salvar a atual</button></h3>
      <div class="chips">${salvas.length ? salvas.map(([n]) => `<button class="chip" data-busca="${esc(n)}"><span class="nome">${esc(n)}</span><span data-apagarbusca="${esc(n)}" title="Apagar">✕</span></button>`).join("") : '<small style="color:var(--suave)">Nenhuma ainda.</small>'}</div></div>
    <div class="grupo"><h3>Datas</h3><div class="datas"><input type="date" id="fDe" value="${F.periodo === "datas" ? esc(F.de) : ""}" title="De"><input type="date" id="fAte" value="${F.periodo === "datas" ? esc(F.ate) : ""}" title="Até"></div></div>
    <div class="grupo"><h3>Laudos</h3><select id="fNormal"><option value="">todos</option><option value="alt" ${F.normal === "alt" ? "selected" : ""}>só com alteração</option><option value="normal" ${F.normal === "normal" ? "selected" : ""}>só 100% normais</option></select></div>
    ${GRUPOS.map(chips).join("")}
    <button id="bLimparTudo">Limpar todos os filtros</button>`;
}

function desenharFaixa() {
  const partes = [];
  if (vista === "lixeira") partes.push(`🗑 Lixeira — os laudos saem de vez depois de ${LIXEIRA_DIAS} dias. <button data-faixa="esvaziar">Esvaziar agora</button> <button data-faixa="sairLixeira">Voltar aos laudos</button>`);
  if (estudo) partes.push(`🎓 Modo estudo — imagens primeiro, conclusão escondida. <button data-faixa="sairEstudo">Sair do modo estudo</button>`);
  $("faixa").innerHTML = partes.join("<br>");
}

// ---------- cartões ----------
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
const semNum = (p) => (p.length ? [{ ...p[0], t: p[0].t.replace(/^\s*\d{1,2}\s*[).\-–:]\s*/, "") }, ...p.slice(1)] : p);
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "?");
const htmlPar = (p, marca = true) => p.map(({ t, b, i, u }) => {
  let x = marca && termos.length ? marcar(t, termos).map((s) => (s.m ? `<mark>${esc(s.t)}</mark>` : esc(s.t))).join("") : esc(t);
  if (u) x = `<u>${x}</u>`;
  if (i) x = `<i>${x}</i>`;
  if (b) x = `<b>${x}</b>`;
  return x;
}).join("");
// conclusão: formatação à mão (destaqueManual) ou o destaque novo do app (lib/destaque.js: só o achado principal)
const fmtConc = (r, p, marca) => htmlPar(r.destaqueManual ? semNum(p) : destacar(semNum(p)), marca);
const nImgs = (r) => Math.max(r.nImagens || 0, r.imgs?.length || 0, r.imgsLocais || 0);

function cartao(ix) {
  const r = completar(ix.r);
  const conc = r.concPars.length ? r.concPars.map((p) => fmtConc(r, p)) : r.itensConc.map((c) => htmlPar(destacar([{ t: c, b: false, i: false, u: false }])));
  const tags = [...ix.classes.map((v) => `<button class="tag classe" data-g="classe" data-v="${esc(v)}">${esc(v)}</button>`),
    ...(r.colecoes || []).map((v) => `<button class="tag colecao" data-g="colecao" data-v="${esc(v)}">${esc(v)}</button>`)].join("");
  const lixeira = vista === "lixeira";
  const n = nImgs(r);
  const corpoEstudo = `<div class="imgs" data-lazy="1">${n ? "" : '<div class="carregando">sem imagens</div>'}</div>
    <div class="esconde"><button data-acao="revelar">Mostrar conclusão</button></div>
    <ol class="conc" hidden>${conc.map((c) => `<li>${c}</li>`).join("")}</ol>`;
  return `<div class="item ${r.normal ? "normal" : ""}" data-acc="${esc(r.acc)}">
    <div class="cab" title="Abrir o laudo completo"><div class="cabtxt"><span class="acc">${esc(r.acc)}</span><span class="data">${dataBr(r.data)}</span><span class="titulo">${esc(ix.exame)}</span></div><div class="cabbtn">
      ${lixeira ? "" : `<button class="icone fav ${r.fav ? "on" : ""}" data-acao="fav" title="Favorito (f)">${r.fav ? "★" : "☆"}</button>`}
      <button class="icone" data-acao="${lixeira ? "apagarDeVez" : "lixeira"}" title="${lixeira ? "Apagar de vez" : "Mover para a lixeira"}">🗑</button></div></div>
    <div class="sub">${[esc(ix.medico), esc([r.sexo, r.idade != null ? r.idade + " anos" : ""].filter(Boolean).join(", ")),
      n ? `🖼 ${n}` : "", r.indicacao ? `Indicação: ${esc(r.indicacao)}` : "",
      lixeira ? `na lixeira desde ${new Date(r.lixeiraEm).toLocaleDateString("pt-BR")}` : ""].filter(Boolean).join(" · ")}</div>
    ${!estudo && tags ? `<div class="tags">${tags}</div>` : ""}
    ${!estudo && MOSTRAR_RESUMO ? `<div class="resumo" contenteditable="true" data-campo="resumo" title="Toque para editar (em branco = automático)">${esc(r.resumo || "")}</div>` : ""}
    ${estudo ? corpoEstudo : `<ol class="conc" contenteditable="true" data-campo="conc" title="Toque para editar">${conc.map((c) => `<li>${c}</li>`).join("")}</ol>`}
    ${!estudo && r.nota ? `<div class="nota">📝 ${esc(r.nota)}</div>` : ""}
    ${lixeira ? `<div class="acoes"><button data-acao="restaurar">Restaurar</button><button data-acao="apagarDeVez">Apagar de vez</button></div>` : ""}
    <div class="aberto"></div>
  </div>`;
}

let observador = null;
function mostrarMais() {
  $("mostrarMais")?.remove();
  const prox = achados.slice(mostrando, mostrando + POR_PAGINA);
  $("lista").insertAdjacentHTML("beforeend", prox.map(cartao).join(""));
  mostrando += prox.length;
  if (mostrando < achados.length) $("lista").insertAdjacentHTML("beforeend", `<button id="mostrarMais">Mostrar mais (${achados.length - mostrando})</button>`);
  if (estudo) {
    observador ||= new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        observador.unobserve(e.target);
        const ix = acharIx(e.target.closest(".item")?.dataset.acc);
        if (ix && nImgs(ix.r)) carregarImagens(e.target, ix.r);
      }
    }, { rootMargin: "300px" });
    $("lista").querySelectorAll('.imgs[data-lazy="1"]').forEach((el) => { el.dataset.lazy = "2"; observador.observe(el); });
  }
}
const acharIx = (acc) => achados.find((x) => x.r.acc === acc) || todos.find((x) => x.r.acc === acc);

// imagens: do cache deste aparelho ou baixadas do Drive
async function carregarImagens(box, r) {
  const n = nImgs(r);
  box.innerHTML = Array.from({ length: n }, (_, i) => `<div class="carregando" data-i="${i}">imagem ${i + 1}…</div>`).join("");
  const srcs = [];
  for (let i = 0; i < n; i++) {
    const lugar = box.querySelector(`.carregando[data-i="${i}"]`);
    if (!lugar) break;
    try {
      const b = await imagemDe(drive.conectado() ? drive.adaptador : null, r, i);
      if (!b) { lugar.textContent = drive.conectado() ? "ainda não enviada pelo PC" : "conecte ao Drive para ver"; continue; }
      const u = URL.createObjectURL(b);
      urls.push(u);
      srcs.push(u);
      lugar.outerHTML = `<img src="${u}" alt="imagem chave ${i + 1}" data-n="${srcs.length - 1}">`;
    } catch (e) { lugar.textContent = e.login ? "conecte ao Drive para ver" : "erro ao baixar"; }
  }
  box.srcs = srcs;
}

async function abrir(item, forcar) {
  const box = item.querySelector(".aberto");
  if (box.innerHTML && !forcar) { box.innerHTML = ""; return; }
  const ix = acharIx(item.dataset.acc);
  if (!ix) return;
  const r = completar(ix.r);
  let html = "", lista = [];
  const fecharLista = () => { if (lista.length) html += `<ol>${lista.map((p) => `<li>${fmtConc(r, p)}</li>`).join("")}</ol>`; lista = []; };
  for (const p of r.pars || []) { if (r.concSet.has(p)) lista.push(p); else { fecharLista(); html += `<p>${htmlPar(p)}</p>`; } }
  fecharLista();
  const par = vista === "lixeira" ? [] : parecidos(ix, todos.filter((x) => !x.r.lixeiraEm));
  box.innerHTML = `<div class="laudo">${html}</div>
    ${nImgs(r) ? `<div class="imgs"></div>` : ""}
    ${vista === "lixeira" ? "" : `<div class="acoes"><button data-acao="editar">✎ Editar</button><button data-acao="copiar">Copiar texto</button>
      <button data-acao="frase" title="Guarda o trecho selecionado (ou a conclusão) como frase-modelo">＋ Frase</button>
      <button data-acao="colecoes">Coleções</button>${r.notionId && r.notionPagina ? `<button data-acao="notion">Notion ↗</button>` : ""}</div>
    <div class="notaEd"><textarea data-nota placeholder="Nota pessoal (só sua; vai para todos os aparelhos)">${esc(r.nota || "")}</textarea></div>
    ${par.length ? `<div class="parecidos"><b>Laudos parecidos</b>${par.map((p) => `<a data-ir="${esc(p.r.acc)}">${esc(p.exame)} · ${dataBr(p.r.data)} — ${esc((p.r.resumo || "").slice(0, 90))}</a>`).join("")}</div>` : ""}`}`;
  const imgs = box.querySelector(".imgs");
  if (imgs) carregarImagens(imgs, r);
}

// ---------- ações nos cartões ----------
$("lista").addEventListener("click", async (e) => {
  if (e.target.id === "mostrarMais") return mostrarMais();
  const item = e.target.closest(".item");
  const tag = e.target.closest("[data-g]");
  if (tag && item) { ligarFaceta(tag.dataset.g, tag.dataset.v, true); return; }
  if (!item) return;
  selecionar(item, false);
  if (e.target.tagName === "IMG") { const box = e.target.closest(".imgs"); return abrirVisor(box.srcs || [e.target.src], +e.target.dataset.n || 0); }
  const ir = e.target.closest("[data-ir]");
  if (ir) { irPara(ir.dataset.ir); return; }
  const acao = e.target.closest("[data-acao]")?.dataset.acao;
  const ix = acharIx(item.dataset.acc);
  const r = ix?.r;
  if (!r) return;
  if (acao === "fav") return anotar(r, { fav: !r.fav }).then(() => redesenhar(item));
  if (acao === "copiar") return copiar(r);
  if (acao === "editar") return editar(item, r);
  if (acao === "salvar") return salvar(item, r);
  if (acao === "cancelar") return abrir(item, true);
  if (acao === "frase") return guardarFrase(r);
  if (acao === "colecoes") return abrirColecoes(r);
  if (acao === "revelar") { item.querySelector(".conc").hidden = false; e.target.closest(".esconde").remove(); return; }
  if (acao === "notion") return window.open(`https://www.notion.so/${String(r.notionPagina).replace(/-/g, "")}#${String(r.notionId).replace(/-/g, "")}`, "_blank");
  if (acao === "lixeira") { await moverParaLixeira([r]); item.remove(); msg(`Acesso ${r.acc} foi para a lixeira`); return; }
  if (acao === "restaurar") { await anotar(r, { lixeiraEm: 0 }); item.remove(); msg(`Acesso ${r.acc} restaurado`); return; }
  if (acao === "apagarDeVez") {
    if (!confirm(`Apagar de vez o acesso ${r.acc}?\n(sai de todos os aparelhos, do Drive e do banco da extensão; o Notion não muda)`)) return;
    await apagarDeVez([r]); item.remove(); msg(`Acesso ${r.acc} apagado de vez`); return;
  }
  if (e.target.closest(".cab")) abrir(item);
});

function redesenhar(item) {
  const ix = acharIx(item.dataset.acc);
  if (!ix) return;
  const aberto = !!item.querySelector(".aberto").innerHTML;
  const tmp = document.createElement("div");
  tmp.innerHTML = cartao(ix);
  const novo = tmp.firstElementChild;
  if (item.classList.contains("sel")) novo.classList.add("sel");
  item.replaceWith(novo);
  if (aberto) abrir(novo);
  return novo;
}
async function atualizarIx(acc) {
  const r = await db.laudo(acc);
  const novo = r && !r.apagado ? indexar(r) : null;
  for (const arr of [todos, achados]) {
    const i = arr.findIndex((x) => x.r.acc === acc);
    if (i >= 0) { if (novo) arr[i] = novo; else arr.splice(i, 1); }
  }
  return novo;
}
async function irPara(acc) {
  F = { ...PADRAO, q: acc, ordem: F.ordem };
  vista = "laudos";
  await buscar();
  const item = $("lista").querySelector(".item");
  if (item) { abrir(item); selecionar(item, true); }
}
async function copiar(r) {
  const ix = acharIx(r.acc);
  const txt = [ix?.exame || r.titulo, `Acesso ${r.acc} · ${dataBr(r.data)} · ${ix?.medico || r.medico || ""}`, "", ...(r.pars || []).map((p) => p.map((s) => s.t).join(""))].join("\n");
  try { await navigator.clipboard.writeText(txt); msg("Laudo copiado"); } catch { msg("Não consegui copiar"); }
}

// anotações (favorito, coleções, nota, lixeira): não mexem no conteúdo do laudo nem vão para a extensão
async function anotar(r, campos) {
  const agora = Date.now();
  await db.atualizar(r.acc, { ...campos, anotEm: agora, mudadoEm: agora });
  await atualizarIx(r.acc);
  agendarSincronia();
}
$("lista").addEventListener("change", async (e) => {
  if (!e.target.matches("[data-nota]")) return;
  const r = acharIx(e.target.closest(".item")?.dataset.acc)?.r;
  if (!r) return;
  await anotar(r, { nota: e.target.value.trim() });
  msg("Nota salva");
  const item = e.target.closest(".item");
  const nota = item.querySelector(".nota");
  if (nota) nota.textContent = e.target.value.trim() ? "📝 " + e.target.value.trim() : "";
});

// ---------- lixeira ----------
async function moverParaLixeira(regs) {
  for (const r of regs) await anotar(r, { lixeiraEm: Date.now() });
}
async function apagarDeVez(regs) {
  const agora = Date.now();
  for (const r of regs) {
    const l = await db.laudo(r.acc);
    await db.apagarImagens(r.acc, nImgs(l || r));
    await db.salvar({ acc: r.acc, data: r.data, apagado: true, mudadoEm: agora, nuvemEm: l?.nuvemEm ?? null, apagarImgs: l?.imgs || [] });
    await atualizarIx(r.acc);
  }
  agendarSincronia();
}
async function esvaziarVencidos() {
  const limite = Date.now() - LIXEIRA_DIAS * DIA;
  const vencidos = todos.filter((ix) => ix.r.lixeiraEm && ix.r.lixeiraEm < limite).map((ix) => ix.r);
  if (vencidos.length) await apagarDeVez(vencidos);
}

// ---------- edição (igual à página Banco da extensão) ----------
$("lista").addEventListener("keydown", (e) => {
  if (!e.target.isContentEditable || !e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === "s" || k === "u") { e.preventDefault(); document.execCommand("underline"); }
  else if (k === "b") { e.preventDefault(); document.execCommand("bold"); }
  else if (k === "i") { e.preventDefault(); document.execCommand("italic"); }
});
$("fmt").addEventListener("mousedown", (e) => e.preventDefault());
$("fmt").addEventListener("touchstart", (e) => { const b = e.target.closest("[data-fmt]"); if (b) { e.preventDefault(); document.execCommand(b.dataset.fmt); } }, { passive: false });
$("fmt").addEventListener("click", (e) => { const b = e.target.closest("[data-fmt]"); if (b) document.execCommand(b.dataset.fmt); });
$("lista").addEventListener("focusin", (e) => {
  if (e.target.isContentEditable && matchMedia("(pointer: coarse)").matches) $("fmt").style.display = "flex";
  const el = e.target.closest?.("[data-campo]");
  if (el && el.dataset.orig == null) el.dataset.orig = el.innerHTML;
});
$("lista").addEventListener("focusout", async (e) => {
  setTimeout(() => { if (!document.activeElement?.isContentEditable) $("fmt").style.display = "none"; }, 50);
  const el = e.target.closest?.("[data-campo]");
  if (!el || el.dataset.orig == null || el.innerHTML === el.dataset.orig) return;
  const item = el.closest(".item");
  const r = acharIx(item?.dataset.acc)?.r;
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
  vocab = null;
  const novo = await atualizarIx(r.acc);
  agendarSincronia();
  return novo;
}
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
function editar(item, r) {
  const box = item.querySelector(".aberto");
  if (!box.innerHTML) { abrir(item).then(() => editar(item, r)); return; }
  const laudoEl = box.querySelector(".laudo");
  if (!laudoEl) return;
  // sem os destaques da busca no texto que vai ser editado
  completar(r);
  let html = "", lista = [];
  const fecharLista = () => { if (lista.length) html += `<ol>${lista.map((p) => `<li>${fmtConc(r, p, false)}</li>`).join("")}</ol>`; lista = []; };
  for (const p of r.pars || []) { if (r.concSet.has(p)) lista.push(p); else { fecharLista(); html += `<p>${htmlPar(p, false)}</p>`; } }
  fecharLista();
  laudoEl.innerHTML = html;
  laudoEl.contentEditable = "true";
  laudoEl.classList.add("editando");
  laudoEl.focus();
  box.querySelector(".acoes").innerHTML = `<label class="rotres">Resumo (deixe em branco para o automático)
      <input class="edResumo" value="${esc(r.resumoManual ? r.resumo : "")}" placeholder="${esc(r.resumo || "")}"></label>
    <button data-acao="salvar">Salvar</button><button data-acao="cancelar">Cancelar</button>`;
  msg("Editando — Ctrl+B negrito, Ctrl+I itálico, Ctrl+U sublinhado");
}
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
  await salvarEdicao(r, pars, resumo, !!r.destaqueManual);
  const novo = redesenhar(item);
  if (novo) abrir(novo, true);
  msg("Laudo salvo");
}

// ---------- facetas, períodos, buscas salvas ----------
function ligarFaceta(g, v, so = false) {
  const sel = new Set(F.facetas[g] || []);
  if (sel.has(v) && !so) sel.delete(v); else sel.add(v);
  F.facetas = { ...F.facetas, [g]: [...sel] };
  buscar();
}
$("facetas").addEventListener("click", async (e) => {
  const ap = e.target.closest("[data-apagarbusca]");
  if (ap) { e.stopPropagation(); if (confirm(`Apagar a busca salva "${ap.dataset.apagarbusca}"?`)) { P = await prefs.apagar("buscas", ap.dataset.apagarbusca); agendarSincronia(); buscar(); } return; }
  const b = e.target.closest("[data-busca]");
  if (b) { const s = P.buscas[b.dataset.busca]; if (s) { F = { ...PADRAO, ...s.f }; vista = "laudos"; buscar(); } return; }
  const c = e.target.closest(".chip[data-g]");
  if (c) return ligarFaceta(c.dataset.g, c.dataset.v);
  const x = e.target.closest("[data-expandir]");
  if (x) { abertos.has(x.dataset.expandir) ? abertos.delete(x.dataset.expandir) : abertos.add(x.dataset.expandir); return buscar(); }
  if (e.target.id === "bLimparTudo") { F = { ...PADRAO, ordem: F.ordem }; return buscar(); }
  if (e.target.id === "bSalvarBusca") {
    const nome = prompt("Nome desta busca:", F.q || "Minha busca");
    if (!nome?.trim()) return;
    P = await prefs.mudar("buscas", nome.trim(), { f: { ...F } });
    agendarSincronia();
    buscar();
    msg(`Busca "${nome.trim()}" salva`);
  }
});
$("facetas").addEventListener("change", (e) => {
  if (e.target.id === "fNormal") { F.normal = e.target.value; buscar(); }
  if (e.target.id === "fDe" || e.target.id === "fAte") {
    F.de = $("fDe").value; F.ate = $("fAte").value;
    F.periodo = F.de || F.ate ? "datas" : "";
    buscar();
  }
});
let tempo = null;
$("q").addEventListener("input", () => { F.q = $("q").value; clearTimeout(tempo); tempo = setTimeout(buscar, 300); });
$("onde").addEventListener("change", () => { F.onde = $("onde").value; buscar(); });
$("ordem").addEventListener("change", () => { F.ordem = $("ordem").value; buscar(); });
document.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => { F.periodo = b.dataset.periodo; F.de = F.ate = ""; buscar(); }));
$("pFav").addEventListener("click", () => { F.fav = !F.fav; buscar(); });
// filtros em cima da lista (abre/fecha; no PC começa aberto)
if (lerLocal("app.filtrosAbertos", innerWidth >= 1000)) document.body.classList.add("filtros");
$("bFiltros").addEventListener("click", () => gravarLocal("app.filtrosAbertos", document.body.classList.toggle("filtros")));
$("faixa").addEventListener("click", async (e) => {
  const a = e.target.dataset.faixa;
  if (a === "sairLixeira") { vista = "laudos"; buscar(); }
  if (a === "sairEstudo") { estudo = false; gravarLocal("app.estudo", false); buscar(); }
  if (a === "esvaziar" && achados.length && confirm(`Apagar de vez os ${achados.length} laudo(s) da lixeira?`)) { await apagarDeVez(achados.map((x) => x.r)); buscar(); }
});

// ---------- coleções ----------
let colAlvo = null;
function abrirColecoes(r) {
  colAlvo = r;
  const nomes = new Set([...prefs.ativos(P, "colecoes").map(([n]) => n), ...todos.flatMap((ix) => ix.r.colecoes || [])]);
  $("colLista").innerHTML = nomes.size ? [...nomes].sort().map((n) => `<label class="check"><input type="checkbox" data-col="${esc(n)}" ${(r.colecoes || []).includes(n) ? "checked" : ""}> ${esc(n)}</label>`).join("")
    : "<small>Nenhuma coleção ainda. Crie a primeira abaixo.</small>";
  $("dColecoes").showModal();
}
$("colLista").addEventListener("change", async (e) => {
  const n = e.target.dataset.col;
  if (!n || !colAlvo) return;
  const set = new Set(colAlvo.colecoes || []);
  e.target.checked ? set.add(n) : set.delete(n);
  await anotar(colAlvo, { colecoes: [...set] });
  colAlvo = acharIx(colAlvo.acc)?.r || colAlvo;
  const item = $("lista").querySelector(`.item[data-acc="${CSS.escape(colAlvo.acc)}"]`);
  if (item) redesenhar(item);
});
$("colCriar").addEventListener("click", async () => {
  const n = $("colNova").value.trim();
  if (!n) return;
  P = await prefs.mudar("colecoes", n, {});
  $("colNova").value = "";
  if (colAlvo) { await anotar(colAlvo, { colecoes: [...new Set([...(colAlvo.colecoes || []), n])] }); colAlvo = acharIx(colAlvo.acc)?.r || colAlvo; abrirColecoes(colAlvo); }
  const item = colAlvo && $("lista").querySelector(`.item[data-acc="${CSS.escape(colAlvo.acc)}"]`);
  if (item) redesenhar(item);
});

// ---------- frases-modelo ----------
async function guardarFrase(r) {
  let t = String(getSelection()?.toString() || "").trim();
  if (!t) { completar(r); t = prompt("Frase-modelo (edite à vontade):", r.itensConc.join(" ")) || ""; }
  if (!t.trim()) return;
  P = await prefs.mudar("frases", "f" + Date.now().toString(36), { texto: t.trim() });
  agendarSincronia();
  msg("Frase guardada (⋯ › Frases-modelo)");
}
function desenharFrases() {
  const filtro = $("fBusca").value.trim();
  const lista = prefs.ativos(P, "frases").sort((a, b) => b[1].em - a[1].em)
    .filter(([, v]) => !filtro || v.texto.toLowerCase().includes(filtro.toLowerCase()));
  $("frases").innerHTML = lista.length ? lista.map(([k, v]) => `<div class="frase"><p data-copiar="${esc(k)}" title="Copiar">${esc(v.texto)}</p><button class="icone" data-apagarfrase="${esc(k)}" title="Apagar">✕</button></div>`).join("")
    : "<small>Nenhuma frase. Abra um laudo, selecione um trecho e toque em ＋ Frase, ou escreva abaixo.</small>";
}
$("fBusca").addEventListener("input", desenharFrases);
$("frases").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copiar]");
  if (c) { try { await navigator.clipboard.writeText(P.frases[c.dataset.copiar].texto); msg("Frase copiada"); c.style.opacity = .5; setTimeout(() => (c.style.opacity = 1), 400); } catch {} return; }
  const a = e.target.closest("[data-apagarfrase]");
  if (a && confirm("Apagar esta frase?")) { P = await prefs.apagar("frases", a.dataset.apagarfrase); agendarSincronia(); desenharFrases(); }
});
$("fSalvar").addEventListener("click", async () => {
  const t = $("fNova").value.trim();
  if (!t) return;
  P = await prefs.mudar("frases", "f" + Date.now().toString(36), { texto: t });
  $("fNova").value = "";
  agendarSincronia();
  desenharFrases();
});

// ---------- estatísticas ----------
function desenharEstat() {
  const s = estatisticas(achados);
  const barras = (titulo, lista, g) => {
    if (!lista.length) return "";
    const max = lista[0][1];
    return `<h3 style="font-size:13px;margin:0 0 6px">${titulo}</h3><div class="barras">${lista.slice(0, 10).map(([v, n]) =>
      `<span class="r" ${g ? `data-g="${g}" data-v="${esc(v)}"` : ""} title="${esc(v)}">${esc(v)}</span><span class="b" style="width:${Math.max(2, (n / max) * 100)}%"></span><span>${n}</span>`).join("")}</div>`;
  };
  const meses = s.meses.slice(-24);
  const mx = Math.max(1, ...meses.map((m) => m[1]));
  $("estat").innerHTML = `<div class="numeros"><div><b>${s.total}</b><span>laudos na busca</span></div><div><b>${s.total ? Math.round((s.normais / s.total) * 100) : 0}%</b><span>100% normais</span></div>
      <div><b>${s.medico.length}</b><span>médicos</span></div><div><b>${s.exame.length}</b><span>tipos de exame</span></div></div>
    ${meses.length ? `<h3 style="font-size:13px;margin:0">Laudos por mês</h3><div class="meses">${meses.map(([m, n]) => `<i style="height:${(n / mx) * 100}%" title="${m}: ${n}"></i>`).join("")}</div>
      <div class="meses-rot"><span>${meses[0][0]}</span><span>${meses[meses.length - 1][0]}</span></div>` : ""}
    ${barras("Classificações", s.classe, "classe")}${barras("Exames", s.exame, "exame")}
    ${barras("Médicos", s.medico, "medico")}${barras("Modalidades", s.mod, "mod")}
    <small>Toque num item para filtrar por ele.</small>`;
}
$("estat").addEventListener("click", (e) => {
  const c = e.target.closest("[data-g]");
  if (c) { $("dEstat").close(); ligarFaceta(c.dataset.g, c.dataset.v, true); }
});

// ---------- exportar ----------
function baixar(nome, conteudo, tipo) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportarCsv() {
  const cel = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cab = ["acesso", "data", "exame", "modalidade", "medico", "idade", "sexo", "indicacao", "conclusao", "classificacoes", "colecoes", "favorito", "nota"];
  const linhas = achados.map((ix) => { const r = completar(ix.r); return [r.acc, dataBr(r.data), ix.exame, ix.mod, ix.medico, r.idade ?? "", r.sexo || "", r.indicacao || "",
    r.itensConc.map((c, i) => `${i + 1}. ${c}`).join(" "), ix.classes.join(", "), (r.colecoes || []).join(", "), r.fav ? "sim" : "", r.nota || ""].map(cel).join(";"); });
  baixar(`laudos-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [cab.join(";"), ...linhas].join("\r\n"), "text/csv;charset=utf-8");
  msg(`${achados.length} laudo(s) exportado(s)`);
}
function exportarPdf() {
  const t0 = termos; termos = [];
  $("impressao").innerHTML = `<h1>Banco de laudos — ${achados.length} laudo(s)${F.q ? ` · busca: ${esc(F.q)}` : ""}</h1>` + achados.map((ix) => {
    const r = completar(ix.r);
    return `<div class="p"><b>${esc(ix.exame)}</b> — ${dataBr(r.data)} · acesso ${esc(r.acc)} · ${esc(ix.medico)}<br>
      ${r.indicacao ? `<i>Indicação:</i> ${esc(r.indicacao)}<br>` : ""}${r.itensConc.map((c, i) => `${i + 1}. ${esc(c)}`).join("<br>")}${r.nota ? `<br><i>Nota:</i> ${esc(r.nota)}` : ""}</div>`;
  }).join("");
  termos = t0;
  setTimeout(() => window.print(), 50);
}

// ---------- menu ----------
$("bMenu").addEventListener("click", () => {
  $("mEstudo").textContent = estudo ? "ligado" : "desligado";
  const nl = todos.filter((ix) => ix.r.lixeiraEm).length;
  $("mLixeira").textContent = nl ? `${nl}` : "";
  $("menu").showModal();
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) e.target.closest("dialog").close(); });
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
$("menu").addEventListener("click", async (e) => {
  const m = e.target.closest("[data-menu]")?.dataset.menu;
  if (!m) return;
  $("menu").close();
  if (m === "estudo") { estudo = !estudo; gravarLocal("app.estudo", estudo); buscar(); }
  if (m === "estatisticas") { desenharEstat(); $("dEstat").showModal(); }
  if (m === "frases") { desenharFrases(); $("dFrases").showModal(); }
  if (m === "csv") exportarCsv();
  if (m === "pdf") exportarPdf();
  if (m === "lixeira") { vista = "lixeira"; buscar(); }
  if (m === "filtradosLixeira") {
    const n = achados.length;
    if (!n || vista === "lixeira") return msg("Nenhum laudo na busca atual");
    if (!confirm(`Mover os ${n} laudo(s) da busca atual para a lixeira?\n(dá para restaurar por ${LIXEIRA_DIAS} dias)`)) return;
    await moverParaLixeira(achados.map((x) => x.r));
    msg(`${n} laudo(s) na lixeira`);
    buscar();
  }
  if (m === "refazer") refazerResumos(true);
  if (m === "atalhos") $("dAtalhos").showModal();
  if (m === "config") abrirConfig();
});

// ---------- resumos ----------
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
  if (mudaram) { msg(`Resumos atualizados em ${mudaram} laudo(s)`); await carregar(); buscar(); }
  else if (forcar) msg("Os resumos já estão no formato atual");
}

// ---------- tema ----------
function aplicarTema() {
  const t = lerLocal("app.tema", "auto");
  const escuro = t === "escuro" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
  document.querySelector('meta[name="theme-color"]').content = escuro ? "#121821" : "#0F5C4D";
}
$("bTema").addEventListener("click", () => {
  gravarLocal("app.tema", document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro");
  aplicarTema();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicarTema);

// ---------- atalhos de teclado ----------
function selecionar(item, rolar = true) {
  $("lista").querySelector(".item.sel")?.classList.remove("sel");
  if (!item) return;
  item.classList.add("sel");
  if (rolar) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
document.addEventListener("keydown", (e) => {
  if (visorAberto() || document.querySelector("dialog[open]")) return;
  const digitando = e.target.matches?.("input, textarea, select") || e.target.isContentEditable;
  if (e.key === "Escape") { if (digitando) e.target.blur(); else { selecionar(null); } return; }
  if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
  const itens = [...$("lista").querySelectorAll(".item")];
  const atual = $("lista").querySelector(".item.sel");
  const i = itens.indexOf(atual);
  const r = atual && acharIx(atual.dataset.acc)?.r;
  const k = e.key;
  if (k === "/") { e.preventDefault(); $("q").focus(); $("q").select(); }
  else if (k === "j") { selecionar(itens[Math.min(itens.length - 1, i + 1)]); if (i + 1 >= itens.length - 2 && mostrando < achados.length) mostrarMais(); }
  else if (k === "k") selecionar(itens[Math.max(0, i - 1)]);
  else if (k === "Enter" && atual) abrir(atual);
  else if (k === "f" && r) anotar(r, { fav: !r.fav }).then(() => selecionar(redesenhar(atual), false));
  else if (k === "e" && r) editar(atual, r);
  else if (k === "c" && r) copiar(r);
  else if (k === "t") $("bTema").click();
  else if (k === "?") $("dAtalhos").showModal();
  else return;
  e.preventDefault();
});

// ---------- sincronização ----------
let sincronizando = false;
async function sincronizarTudo({ manual = false } = {}) {
  if (sincronizando) return;
  sincronizando = true;
  const partes = [];
  let acordado = null;
  try { acordado = await navigator.wakeLock?.request("screen"); } catch {}
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
    if (partes.length || manual) { await refazerResumos(false); await carregar(); buscar(); }
  } catch (e) {
    msg(e.login ? "Conecte ao Google Drive (☁)" : `Não consegui sincronizar: ${e.message}`);
  } finally {
    acordado?.release().catch(() => {});
    sincronizando = false;
    estadoNuvem();
  }
}
let tempoSinc = null;
function agendarSincronia() { clearTimeout(tempoSinc); tempoSinc = setTimeout(() => sincronizarTudo(), 4000); }
$("bSync").addEventListener("click", () => sincronizarTudo({ manual: true }));
function estadoNuvem() {
  const precisa = drive.configurado() && !drive.conectado();
  $("bSync").classList.toggle("alerta", precisa);
  $("bSync").innerHTML = precisa ? "☁ Conectar<span class=longo> e sincronizar</span>" : "⇅<span class=longo> Sincronizar</span>";
}

// ---------- configurações ----------
async function abrirConfig() {
  $("oResumo").checked = MOSTRAR_RESUMO;
  $("oCliente").value = lerLocal("app.clienteId", "");
  $("oTema").value = lerLocal("app.tema", "auto");
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
}
$("oResumo").addEventListener("change", () => { MOSTRAR_RESUMO = $("oResumo").checked; gravarLocal("app.mostrarResumo", MOSTRAR_RESUMO); buscar(); });
$("oTema").addEventListener("change", () => { gravarLocal("app.tema", $("oTema").value); aplicarTema(); });
$("oCliente").addEventListener("change", () => {
  const v = $("oCliente").value.trim();
  gravarLocal("app.clienteId", v);
  drive.configurar(v || CONFIG.clienteId);
  drive.prepararLogin();
  estadoNuvem();
});
$("oConectar").addEventListener("click", async () => {
  try { await drive.conectar(); $("dOpcoes").close(); sincronizarTudo({ manual: true }); }
  catch (e) { alert("Não conectou: " + e.message); }
});
$("oDesconectar").addEventListener("click", () => { drive.desconectar(); $("dOpcoes").close(); estadoNuvem(); msg("Desconectado do Google Drive"); });

// ---------- início ----------
aplicarTema();
estadoNuvem();
await carregar();
await esvaziarVencidos();
await buscar();
await refazerResumos(false);
sincronizarTudo();
setInterval(() => { if (document.visibilityState === "visible") sincronizarTudo(); }, 5 * 60e3);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizarTudo(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
