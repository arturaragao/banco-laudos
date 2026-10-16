// Converte o HTML do laudo (Vue Motion: <p>, <span style="font-weight:bold; text-decoration:underline; font-style:italic">,
// <b>, <i>, <u>, <br>) em parágrafos do Notion, mantendo negrito, itálico e sublinhado.
// Sem DOMParser: roda no service worker.

const ENTIDADES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", deg: "°",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä", eacute: "é", egrave: "è", ecirc: "ê",
  iacute: "í", icirc: "î", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", uacute: "ú", uuml: "ü",
  ccedil: "ç", ntilde: "ñ", Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Eacute: "É", Ecirc: "Ê",
  Iacute: "Í", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Uacute: "Ú", Ccedil: "Ç", Ntilde: "Ñ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•",
  middot: "·", times: "×", plusmn: "±", micro: "µ", le: "≤", ge: "≥", rarr: "→", sup2: "²", sup3: "³", frac12: "½",
};

export function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d?);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

const BLOCO = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "table", "ul", "ol"]);
const VAZIAS = new Set(["br", "img", "hr", "meta", "link", "base", "input", "col"]);

// estilo de uma tag -> {b, i, u} (undefined = herda)
function estiloDaTag(tag, attrs) {
  const r = {};
  if (tag === "b" || tag === "strong") r.b = true;
  if (tag === "i" || tag === "em") r.i = true;
  if (tag === "u") r.u = true;
  const st = (attrs.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i) || [])[2] ?? (attrs.match(/\bstyle\s*=\s*'([^']*)'/i) || [])[1] ?? "";
  if (st) {
    const fw = (st.match(/font-weight\s*:\s*([\w-]+)/i) || [])[1];
    if (fw) r.b = /bold|bolder|[6-9]00/i.test(fw);
    const fs = (st.match(/font-style\s*:\s*([\w-]+)/i) || [])[1];
    if (fs) r.i = /italic|oblique/i.test(fs);
    const td = (st.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/i) || [])[1];
    if (td) r.u = /underline/i.test(td);
  }
  return r;
}

// HTML -> [[{t, b, i, u}, ...], ...]  (uma lista de trechos por parágrafo)
export function htmlParaParagrafos(html) {
  const pars = [];
  if (!html || typeof html !== "string") return pars;
  html = html.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ");
  const corpo = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (corpo) html = corpo[1];

  const pilha = [{ tag: "#raiz", b: false, i: false, u: false }];
  let atual = [];
  const topo = () => pilha[pilha.length - 1];
  const fechar = () => {
    // apara espaços nas pontas e descarta parágrafos vazios
    while (atual.length && !atual[0].t.trim()) atual.shift();
    while (atual.length && !atual[atual.length - 1].t.trim()) atual.pop();
    if (atual.length) {
      atual[0].t = atual[0].t.replace(/^\s+/, "");
      atual[atual.length - 1].t = atual[atual.length - 1].t.replace(/\s+$/, "");
      pars.push(atual);
    }
    atual = [];
  };
  const texto = (t) => {
    const { b, i, u } = topo();
    const ult = atual[atual.length - 1];
    if (ult && ult.b === b && ult.i === i && ult.u === u) ult.t += t;
    else atual.push({ t, b, i, u });
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const t = decodificar(m[4]).replace(/[ \t\r\n\f ]+/g, " ");
      if (t.trim() || atual.length) texto(t);
      continue;
    }
    if (!m[2]) continue;
    const fecha = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3] || "";
    if (tag === "br") { fechar(); continue; }
    if (BLOCO.has(tag)) fechar();
    if (VAZIAS.has(tag) || /\/\s*$/.test(attrs)) continue;
    if (fecha) {
      // fecha até a tag correspondente (HTML de Word costuma vir com tags mal fechadas)
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].tag === tag) { pilha.length = k; break; }
      }
    } else {
      const pai = topo(), est = estiloDaTag(tag, attrs);
      pilha.push({ tag, b: est.b ?? pai.b, i: est.i ?? pai.i, u: est.u ?? pai.u });
    }
  }
  fechar();
  return pars;
}

export function textoDoParagrafo(p) {
  return p.map((s) => s.t).join("");
}

// chave para achar o grupo no Notion: maiúsculas, sem acento, sem pontuação e sem "de/do/da/e",
// com grafias equivalentes unificadas — "TC DE ABDÔMEN TOTAL" e "TC DO ABDOME TOTAL." caem no mesmo grupo
const GRAFIAS = [[/\bABDOMEN\b/g, "ABDOME"], [/\bTORAXICA\b/g, "TORACICA"], [/\bCRANIANA\b/g, "CRANIO"]];
// "TOMOGRAFIA COMPUTADORIZADA DO TÓRAX" -> "TC DO TÓRAX"; "ARTRORRESSONÂNCIA MAGNÉTICA DO OMBRO" -> "ARTRO-RM DO OMBRO"
const MAGN = String.raw`(?:\s+(?:NUCLEAR\s+)?MAGN[ÉE]TICA)?`;
const RESS = String.raw`[\s-]?R?RESSON[ÂA]NCIA` + MAGN;
const TOMO = String.raw`[\s-]?TOMOGRAFIA(?:\s+COMPUTADORIZADA)?`;
const ABREVIACOES = [
  [new RegExp(String.raw`\b(ARTRO|ANGIO|COLANGIO|ENTERO|URO|NEURO)` + RESS, "gi"), "$1-RM"],
  [new RegExp(String.raw`\bRESSON[ÂA]NCIA` + MAGN, "gi"), "RM"],
  [new RegExp(String.raw`\b(ARTRO|ANGIO|ENTERO|URO|COLONO|DENTO)` + TOMO, "gi"), "$1-TC"],
  [new RegExp(String.raw`\bTOMOGRAFIA(?:\s+COMPUTADORIZADA)?`, "gi"), "TC"],
  [/\b(?:MULTIDETECTORES|MULTISLICE|HELICOIDAL|COMPUTADORIZADA)\b/gi, ""],
  [/\b(?:ULTRA[\s-]?SSONOGRAFIA|ULTRA[\s-]?SONOGRAFIA|ULTRA[\s-]?SSOM|ULTRA[\s-]?SOM|ECOGRAFIA)\b/gi, "US"],
  [/\bRADIOGRAFIA(?:\s+DIGITAL)?\b|\bRAIOS?[\s-]?X\b/gi, "RX"],
  [/\bMAMOGRAFIA(?:\s+DIGITAL)?\b/gi, "MMG"],
  [/\bDENSITOMETRIA\s+[ÓO]SSEA\b/gi, "DMO"],
  // lateralidade não entra no título ("RM DO OMBRO DIREITO" -> "RM DO OMBRO")
  [/(?:\s*,)?\s+(?:(?:À|A|AO|DO|DA)\s+)?\(?(?:DIREIT[OA]S?|ESQUERD[OA]S?|BILATERA(?:L|IS)(?:MENTE)?)(?:\s+E\s+(?:DIREIT|ESQUERD)[OA]S?)?\)?(?![A-Za-zÀ-ú])/gi, ""],
];
export function abreviarTitulo(t) {
  let s = String(t || "");
  for (const [re, por] of ABREVIACOES) s = s.replace(re, (...m) => por.replace("$1", String(m[1] || "").toUpperCase()));
  return s.replace(/\s{2,}/g, " ").replace(/\s+([,.;)])/g, "$1").trim();
}

export function chaveGrupo(t) {
  let k = abreviarTitulo(t).normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ");
  for (const [re, por] of GRAFIAS) k = k.replace(re, por);
  return k.split(" ").filter((w) => w && !["DE", "DO", "DA", "DOS", "DAS", "E"].includes(w)).join(" ");
}

export function normalizarNome(t) {
  return String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\(DRA?\.?\)|\bDRA?\.\s/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();
}

// "ARAGÃO; silva" -> o médico do laudo bate com algum dos nomes?
export function medicoConfere(filtro, medico) {
  const nomes = String(filtro || "").split(/[;\n]+/).map(normalizarNome).filter(Boolean);
  if (!nomes.length) return true;
  const palavras = normalizarNome(medico).split(" ").filter(Boolean);
  if (!palavras.length) return false;
  // cada palavra digitada precisa ser o começo de alguma palavra do nome ("ARAG" acha "ARAGÃO, ARTUR")
  return nomes.some((n) => n.split(" ").every((parte) => palavras.some((p) => p.startsWith(parte))));
}

// ---------- blocos do Notion ----------
const MAX_TXT = 1900;

export function rt(txt, { bold = false, italic = false, underline = false, color = "" } = {}) {
  const out = [];
  txt = String(txt ?? "");
  for (let p = 0; p < txt.length; p += MAX_TXT) {
    const item = { type: "text", text: { content: txt.slice(p, p + MAX_TXT) } };
    const ann = {};
    if (bold) ann.bold = true;
    if (italic) ann.italic = true;
    if (underline) ann.underline = true;
    if (color) ann.color = color;
    if (Object.keys(ann).length) item.annotations = ann;
    out.push(item);
  }
  return out;
}

function juntarIguais(itens) {
  const out = [];
  for (const it of itens) {
    const ult = out[out.length - 1];
    if (ult && JSON.stringify(ult.annotations || {}) === JSON.stringify(it.annotations || {}) &&
        ult.text.content.length + it.text.content.length <= MAX_TXT) {
      ult.text.content += it.text.content;
    } else out.push({ ...it, text: { content: it.text.content } });
  }
  return out;
}

function limitar(itens, max = 100) {
  itens = juntarIguais(itens);
  if (itens.length <= max) return itens;
  const resto = itens.slice(max - 1).map((x) => x.text.content).join("");
  return [...itens.slice(0, max - 1), ...rt(resto.slice(0, MAX_TXT))];
}

export function paragrafo(rich) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: limitar(rich) } };
}

// conclusao = Set com os parágrafos da conclusão: viram lista numerada (1., 2., 3.)
// destacar(p) = a conclusão com as palavras importantes em negrito + sublinhado
export function blocosDoLaudo(pars, conclusao, destacar) {
  // conclusão já formatada à mão (destaqueManual): sem destaque automático
  return pars.map((p) => (conclusao?.has(p) ? itemLista(destacar ? destacar(p) : p, true) : paragrafo(p.flatMap((s) => rt(s.t, { bold: s.b, italic: s.i, underline: s.u })))));
}

const richPar = (p) => p.flatMap((s) => rt(s.t, { bold: s.b, italic: s.i, underline: s.u }));

// ficha do exame no topo do toggle: exame, data do exame, acesso, médico e (no resumo) indicação
export function blocoFicha({ exame, dataExame, acesso, medico, dataLaudo, indicacao, resumo }) {
  const r = [];
  const linha = (rotulo, valor) => {
    if (!valor) return;
    if (r.length) r.push(...rt("\n"));
    r.push(...rt(rotulo + ": ", { bold: true }), ...(Array.isArray(valor) ? valor : rt(valor)));
  };
  linha("Exame", exame);
  linha("Data do exame", [...rt(dataExame || "?"), ...rt("   ·   "), ...rt("Acesso: ", { bold: true }), ...rt(acesso)]);
  if (medico !== undefined) linha("Laudado por", `${medico || "(não informado)"}${dataLaudo ? `  (laudo de ${dataLaudo})` : ""}`);
  if (indicacao) linha("Indicação", indicacao);
  if (resumo) linha("Resumo", resumo);
  return { object: "block", type: "callout", callout: { rich_text: limitar(r), icon: { type: "emoji", emoji: "🩻" }, color: "gray_background" } };
}

// "1) Fulano" / "2. Beltrano" / "- x" -> sem a numeração (vira item de lista)
function semNumeracao(p) {
  if (!p.length) return p;
  const q = p.map((s) => ({ ...s }));
  q[0].t = q[0].t.replace(/^\s*(\d{1,2}\s*[).\-–]|[-–•*])\s*/, "");
  return q;
}

function subtitulo(txt) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rt(txt, { bold: true, underline: true }) } };
}

// item de lista (com marcador ou numerado: a conclusão sai 1., 2., 3.)
function itemLista(p, numerado = false) {
  const tipo = numerado ? "numbered_list_item" : "bulleted_list_item";
  return { object: "block", type: tipo, [tipo]: { rich_text: limitar(richPar(semNumeracao(p))) } };
}

// modo "só alterações": Alterações (itens) + Conclusão (itens)
export function blocosResumo(alteracoes, conclusao) {
  const out = [subtitulo("Alterações")];
  if (alteracoes.length) out.push(...alteracoes.map(itemLista));
  else out.push(paragrafo(rt("(nenhuma alteração destacada nos achados)", { italic: true, color: "gray" })));
  if (conclusao.length) out.push(subtitulo("Conclusão"), ...conclusao.map((p) => itemLista(p, true)));
  return out;
}

// blocos de uma página do Notion -> [[{t, b, i, u}, ...], ...] (o caminho de volta, para o banco da extensão)
export function blocosParaParagrafos(blocos) {
  const out = [];
  let n = 0;
  for (const b of blocos || []) {
    const rich = b?.[b.type]?.rich_text;
    if (!rich) continue;
    const p = rich.map((r) => ({ t: r.plain_text ?? r.text?.content ?? "", b: !!r.annotations?.bold, i: !!r.annotations?.italic, u: !!r.annotations?.underline }))
      .filter((s) => s.t);
    if (!p.length) continue;
    if (b.type === "numbered_list_item") { p[0] = { ...p[0], t: `${++n}. ${p[0].t}` }; } else n = 0;
    if (b.type === "bulleted_list_item") p[0] = { ...p[0], t: "• " + p[0].t };
    // os toggles do AHK têm o laudo inteiro num bloco só, com quebras de linha: cada linha vira um parágrafo
    out.push(...separarLinhas([p]));
  }
  return out;
}

// parágrafos com "\n" dentro -> um parágrafo por linha (mantém negrito/itálico/sublinhado). Nos toggles do AHK os
// cabeçalhos vêm no meio do texto, só em negrito/sublinhado ("... por deslizamento. Conclusão 1. ..."): viram linha própria.
const CAB_SOLTO = /^(?:indica[çc][ãa]o(?:\s+cl[íi]nica)?|hist[óo]ria\s+cl[íi]nica|t[ée]cnica|protocolo|achados?(?:\s+adicionai?s)?|an[áa]lise\s+comparativa|estudo\s+comparativo|compara[çc][ãa]o|conclus[ãa]o|impress[ãa]o(?:\s+diagn[óo]stica)?|opini[ãa]o|coment[áa]rios?|observa[çc][õo]es|recomenda[çc][õo]es)\s*:?$/i;
export function separarLinhas(pars) {
  const out = [];
  for (const p of pars || []) {
    let linha = [];
    const fechar = () => { if (linha.some((s) => s.t.trim())) out.push(linha.map((s, i) => (i === 0 ? { ...s, t: s.t.replace(/^\s+/, "") } : s))); linha = []; };
    for (const s of p) {
      String(s.t).split(/\r?\n/).forEach((pedaco, i) => {
        if (i > 0) fechar();
        if (!pedaco) return;
        // "Indicação: texto" no começo da linha já é reconhecido: só separa o cabeçalho sem ":" ou no meio da linha
        const cab = pedaco.trim(), noComeco = !linha.some((x) => x.t.trim());
        if ((s.b || s.u) && CAB_SOLTO.test(cab) && !(noComeco && /:$/.test(cab))) { fechar(); linha.push({ ...s, t: cab }); fechar(); return; }
        linha.push({ ...s, t: pedaco });
      });
    }
    fechar();
  }
  return out;
}

export function blocoImagem(fileUploadId) {
  return { object: "block", type: "image", image: { type: "file_upload", file_upload: { id: fileUploadId } } };
}

export function blocoAviso(txt) {
  return paragrafo(rt(txt, { italic: true, color: "gray" }));
}

export function toggleGrupo(titulo) {
  return { object: "block", type: "toggle", toggle: { rich_text: rt(titulo, { bold: true }) } };
}

// título do toggle: "acesso - resumo" (o acesso vem primeiro: é por ele que os repetidos são achados; a data fica no quadro de dentro)
export function toggleAcesso(acc, filhos, resumo) {
  const r = resumoParaTitulo(resumo);
  const b = { object: "block", type: "toggle", toggle: { rich_text: rt(r ? `${acc} - ${r}` : acc) } };
  if (filhos?.length) b.toggle.children = filhos;
  return b;
}

// resumo do banco ("Esteatose hepática. Nódulo pulmonar sólido.") <-> título do toggle ("esteatose hepática; nódulo pulmonar sólido"),
// o mesmo jeito dos resumos que já estão na Notas Tomografia
const minuscula = (t) => (/^[A-ZÀ-Ý]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
export function resumoParaTitulo(resumo) {
  const s = String(resumo || "").trim().replace(/\.$/, "");
  if (!s) return "";
  return s.split(/\.\s+/).map((x) => minuscula(x.trim())).filter(Boolean).join("; ");
}
export function tituloParaResumo(titulo) {
  const s = String(titulo || "").replace(/\*\*/g, "").replace(/^\s*\d{7,12}\s*/, "").replace(/^[-–—:·|]\s*/, "").trim();
  if (!s) return "";
  return s.split(/\s*;\s*/).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1).replace(/\.$/, "") + ".").join(" ");
}

// texto do quadro da extensão -> {exame, data, medico, dataLaudo, indicacao}
export function lerFicha(texto) {
  const t = String(texto || "");
  const pega = (re) => ((t.match(re) || [])[1] || "").trim();
  const medico = pega(/Laudado por:\s*([^\n(]+)/);
  return {
    exame: pega(/Exame:\s*([^\n]+)/), data: pega(/Data do exame:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/),
    medico: /não informado/i.test(medico) ? "" : medico, dataLaudo: pega(/\(laudo de ([^)]+)\)/), indicacao: pega(/Indicação:\s*([^\n]+)/),
  };
}
