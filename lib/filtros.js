// Filtros do que copiar/buscar: médico, exame, indicação, achados, sexo, idade.
//
// Como escrever (campos de texto):
//   ;        separa alternativas — basta UMA bater                          ex.: "tc torax; tc abdome"
//   espaço   as palavras precisam estar na MESMA frase, em qualquer ordem   ex.: "nodulo renal"
//   +        junta termos que precisam aparecer TODOS (em qualquer lugar)  ex.: "rim + nodulo"
//   -termo   exclui quando o termo aparece                                 ex.: "esteatose -leve"
//   "frase"  procura a frase exata (palavras juntas, nessa ordem, sem sinônimos)  ex.: "\"lesao expansiva\""
// Maiúsculas, acentos, plural e singular não importam; o começo da palavra basta ("esteat" acha "esteatose").
// Com sinônimos ligados, "tumor renal" também acha "neoplasia do rim", "lesão expansiva renal", "massa renal"...

export function normalizar(t) {
  return String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ").trim();
}

// plural -> singular (aplicado ao texto do laudo e ao que foi digitado): lesoes->lesao, renais->renal, nodulos->nodulo
export function raiz(w) {
  if (w.length <= 3) return w;
  if (/oes$|aes$/.test(w)) return w.slice(0, -3) + "ao";
  if (/ais$/.test(w)) return w.slice(0, -3) + "al";
  if (/eis$/.test(w) && w.length > 4) return w.slice(0, -3) + "el";
  if (/ois$/.test(w)) return w.slice(0, -3) + "ol";
  if (/ns$/.test(w)) return w.slice(0, -2) + "m";
  if (/(r|z)es$/.test(w) && w.length > 5) return w.slice(0, -2);
  if (/[aeiou]s$/.test(w) && w.length > 4) return w.slice(0, -1);
  return w;
}
const palavrasDe = (t) => normalizar(t).split(" ").filter(Boolean).map(raiz);

// achados que querem dizer a mesma coisa (frases inteiras). Ligado com "usar sinônimos".
export const CONCEITOS = [
  ["tumor", "neoplasia", "neoplasico", "lesao expansiva", "lesao infiltrativa", "processo expansivo", "processo infiltrativo",
    "massa", "neoformacao", "carcinoma", "lesao solida", "lesao neoplasica", "lesao tumoral", "formacao expansiva", "lesao maligna", "malignidade"],
  ["metastase", "implante secundario", "lesao secundaria", "secundarismo", "implante metastatico", "lesao metastatica"],
  ["calculo", "litiase", "nefrolitiase", "colelitiase", "coledocolitiase", "urolitiase", "microlitiase"],
  ["esteatose", "infiltracao gordurosa", "deposito de gordura", "degeneracao gordurosa", "infiltracao adiposa"],
  ["derrame pleural", "efusao pleural", "liquido pleural"],
  ["ascite", "liquido livre"],
  ["linfonodomegalia", "adenomegalia", "adenopatia", "linfonodo aumentado", "linfonodo de dimensao aumentada", "linfonodo proeminente"],
  ["trombose", "trombo", "tromboembolismo", "embolia", "falha de enchimento"],
  ["fratura", "traco de fratura", "descontinuidade cortical", "fraturado"],
  ["aneurisma", "dilatacao aneurismatica"],
  ["cisto", "lesao cistica", "formacao cistica", "imagem cistica"],
  ["nodulo", "formacao nodular", "lesao nodular", "imagem nodular"],
  ["estenose", "estreitamento", "reducao luminal", "reducao do calibre"],
  ["hidronefrose", "dilatacao pielocalicinal", "ectasia pielocalicinal", "ureterohidronefrose", "dilatacao do sistema coletor"],
  ["hepatomegalia", "figado aumentado", "figado de dimensao aumentada", "aumento do figado", "aumento das dimensao do figado"],
  ["esplenomegalia", "baco aumentado", "baco de dimensao aumentada", "aumento do baco"],
  ["cardiomegalia", "aumento da area cardiaca", "aumento do coracao"],
  ["consolidacao", "pneumonia", "processo inflamatorio infeccioso", "processo infeccioso"],
  ["atelectasia", "colapso pulmonar"],
  ["avc", "acidente vascular", "isquemia", "infarto", "lesao isquemica"],
  ["hemorragia", "sangramento", "hematoma", "conteudo hematico"],
  ["abscesso", "colecao", "colecao organizada"],
  ["hernia discal", "protrusao discal", "extrusao discal", "abaulamento discal", "hernia de disco"],
  ["apendicite", "apendice inflamado", "processo inflamatorio do apendice"],
  ["diverticulite", "diverticulo inflamado"],
  ["colecistite", "vesicula inflamada", "processo inflamatorio da vesicula"],
  ["pancreatite", "processo inflamatorio pancreatico", "pancreas inflamado"],
  ["obstrucao", "suboclusao", "oclusao"],
  ["espessamento parietal", "espessamento da parede", "parede espessada"],
  ["enfisema", "doenca pulmonar obstrutiva"],
  ["bronquiectasia", "dilatacao bronquica"],
].map((g) => g.map((frase) => frase.split(" ").map(raiz).filter((w) => !["de", "do", "da", "dos", "das"].includes(w))));

// palavras com o mesmo sentido (começo de palavra, sem acento, no singular). Ligado com "usar sinônimos".
export const SINONIMOS = [
  ["tumor", "neoplas", "massa", "expansiv", "neoformac", "carcinom", "malign"],
  ["renal", "rim", "nefr"],
  ["hepat", "figado"],
  ["pulmo", "pulmao"],
  ["litias", "calcul"],
  ["cist"],
  ["nodul"],
  ["linfonodomegal", "adenomegal", "adenopat"],
  ["fratur"],
  ["hernia", "herniac"],
  ["tromb", "embol"],
  ["derrame", "efus"],
  ["esteatos", "esteatot"],
  ["cerebr", "encefal"],
  ["vesicul", "colecist"],
  ["utero", "uterin"],
  ["ovari", "anexi"],
  ["mama", "mamari"],
  ["tireo", "tiroid"],
  ["adren", "suprarren"],
  ["baco", "esplen"],
  ["coracao", "cardi"],
  ["metast", "secundar"],
  ["aneurism"],
  ["estenos", "estreit"],
  ["dilat", "ectasi"],
];

function alternativas(w, comSinonimos) {
  if (!comSinonimos) return [w];
  for (const g of SINONIMOS) if (g.some((a) => w.startsWith(a) || (a.startsWith(w) && w.length >= 3))) return [...new Set([w, ...g])];
  return [w];
}

const MARCA = String.fromCharCode(2);    // marca as palavras que vieram de uma frase equivalente

const casaPalavra =(x, y) => x.startsWith(y) || (y.length >= 4 && y.startsWith(x) && x.length >= 4);

// "tumor renal" -> variantes ["tumor renal", "neoplasia renal", "lesao expansiva renal", "massa renal", ...]
function variantes(ws, comSinonimos) {
  const out = [ws];
  if (!comSinonimos) return out;
  for (const grupo of CONCEITOS) {
    let achou = null;
    for (const frase of grupo) {
      for (let i = 0; i + frase.length <= ws.length; i++) {
        if (frase.every((f, k) => casaPalavra(ws[i + k], f))) { achou = { i, n: frase.length }; break; }
      }
      if (achou) break;
    }
    if (!achou) continue;
    const base = [...out];
    for (const v of base) {
      for (const frase of grupo) {
        if (out.length >= 80) break;
        // palavras vindas da frase equivalente vão marcadas: não ganham sinônimos de novo ("nefrolitiase" não vira "rim")
        const nova = [...ws.slice(0, achou.i), ...frase.map((w) => MARCA + w), ...ws.slice(achou.i + achou.n)];
        if (v === ws && !out.some((o) => o.join(" ") === nova.join(" "))) out.push(nova);
      }
    }
  }
  return out;
}

// "tc torax; rim + nodulo -cisto" -> [{inc: [termo], exc: []}, {inc: [termo, termo], exc: [termo]}]
// termo = {vs: [variante, ...], frase}; variante = [[alternativas da 1ª palavra], [..2ª..], ...]
export function interpretar(expr, { sinonimos = false } = {}) {
  const alts = [];
  const termo = (texto, frase) => {
    const ws = palavrasDe(texto).filter((w) => frase || !["de", "do", "da", "dos", "das", "e"].includes(w));
    if (!ws.length) return null;
    const vs = (frase ? [ws] : variantes(ws, sinonimos))
      .map((v) => v.map((w) => (w.startsWith(MARCA) ? [w.slice(1)] : frase ? [w] : alternativas(w, sinonimos))));
    return { vs, frase };
  };
  for (const parte of String(expr || "").split(/[;\n]+/)) {
    const inc = [], exc = [];
    // frases entre aspas viram um termo só; o resto é separado por "+"
    const pedacos = [];
    const resto = parte.replace(/(-?)"([^"]+)"/g, (_, menos, frase) => { pedacos.push(menos + "\u0001" + frase); return " + "; });
    for (const p of resto.split("+")) pedacos.push(p);
    for (let p of pedacos) {
      p = p.trim();
      if (!p) continue;
      if (p.startsWith("-\u0001")) { const t = termo(p.slice(2), true); if (t) exc.push(t); continue; }
      if (p.startsWith("\u0001")) { const t = termo(p.slice(1), true); if (t) inc.push(t); continue; }
      // "-cisto" no meio das palavras: vira exclusão
      const negs = [];
      p = p.replace(/(^|\s)-(\S+)/g, (_, esp, w) => { negs.push(w); return esp; }).trim();
      for (const n of negs) { const t = termo(n, false); if (t) exc.push(t); }
      const t = termo(p, false);
      if (t) inc.push(t);
    }
    if (inc.length || exc.length) alts.push({ inc, exc });
  }
  return alts;
}

const bateAlt = (palavra, alts) => alts.some((a) => palavra.startsWith(a));

// onde uma variante aparece na frase -> posições de referência (para checar negação antes delas)
function ocorrenciasVariante(palavras, t, frase) {
  const out = [];
  if (frase) {
    for (let i = 0; i + t.length <= palavras.length; i++) {
      let ok = true;
      for (let k = 0; k < t.length; k++) if (!bateAlt(palavras[i + k], t[k])) { ok = false; break; }
      if (ok) out.push(i);
    }
    return out;
  }
  // palavras soltas: todas na mesma frase, em qualquer ordem. A negação é conferida antes da ÚLTIMA delas
  // ("Rins ... sem sinais de litíase": a negação vem depois de "rins", mas antes de "litíase")
  const pos = t.map((alts) => palavras.findIndex((x) => bateAlt(x, alts)));
  if (pos.some((x) => x < 0)) return out;
  const k = pos.indexOf(Math.max(...pos));
  for (let i = pos[k]; i < palavras.length; i++) if (bateAlt(palavras[i], t[k])) out.push(i);
  return out;
}

// palavras que, antes do achado na mesma frase, indicam que ele foi NEGADO (palavra inteira; * = começo)
const NEGACOES = [
  ["sem"], ["nao"], ["nem"], ["ausencia"], ["ausente"], ["inexistencia"], ["negativo"], ["negativa"],
  ["descartad*"], ["afastad*"], ["excluid*"], ["livre", "de"], ["nenhum"], ["nenhuma"],
];
const JANELA_NEGACAO = 8;
const bate = (palavra, w) => (w.endsWith("*") ? palavra.startsWith(w.slice(0, -1)) : palavra === w);

function negado(palavras, pos) {
  for (let i = Math.max(0, pos - JANELA_NEGACAO); i < pos; i++) {
    for (const n of NEGACOES) {
      if (i + n.length <= pos && n.every((w, k) => palavras[i + k] && bate(palavras[i + k], w))) return true;
    }
  }
  return false;
}

// o termo aparece nesta frase (palavras normalizadas e no singular)? com ignorarNegados, só conta sem negação antes
export function achadoNaFrase(palavras, termo, ignorarNegados) {
  const vs = termo.vs || [termo.p];
  for (const v of vs) {
    for (const pos of ocorrenciasVariante(palavras, v, termo.frase)) if (!ignorarNegados || !negado(palavras, pos)) return true;
  }
  return false;
}

export function frasesDe(texto) {
  return String(texto || "").split(/[.;:!?\n\r]+(?:\s|$)|,\s+(?=mas\b|porem\b|contudo\b)/i)
    .map(palavrasDe).filter((f) => f.length);
}

const aparece = (frases, termo, ign) => frases.some((p) => achadoNaFrase(p, termo, ign));

// o texto satisfaz a expressão? (expressão vazia = tudo passa)
export function confere(expr, texto, { ignorarNegados = false, sinonimos = false } = {}) {
  const alts = typeof expr === "string" ? interpretar(expr, { sinonimos }) : expr;
  if (!alts.length) return true;
  const frases = frasesDe(texto);
  return alts.some(({ inc, exc }) =>
    inc.every((t) => aparece(frases, t, ignorarNegados)) && !exc.some((t) => aparece(frases, t, false)));
}

// a frase/parágrafo tem algum termo POSITIVO da expressão? (para escolher o que mostrar no resumo/busca)
export function trechoCita(expr, texto, { ignorarNegados = true, sinonimos = false } = {}) {
  const alts = typeof expr === "string" ? interpretar(expr, { sinonimos }) : expr;
  const frases = frasesDe(texto);
  return alts.some(({ inc }) => inc.some((t) => aparece(frases, t, ignorarNegados)));
}

// só as FRASES de um texto que citam a expressão (para a lista da busca ficar curta)
export function frasesQueCitam(expr, texto, opcoes = {}) {
  return String(texto || "").split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
    .filter((s) => trechoCita(expr, s, opcoes));
}

// palavras "de conteúdo" de um texto (ex.: conclusão "Esteatose hepática difusa" -> esteatose, hepatica),
// já com sinônimos ("hepatica" também acha "figado") — para achar nos achados o parágrafo do mesmo órgão/achado
const GENERICAS = new Set(("sinal aspecto compativel sugestivo sugestiva difusa difuso leve moderada moderado acentuada acentuado grau " +
  "possivel possibilidade achado exame imagem estudo pequeno pequena discreto discreta sem com para pela pelo entre sobre apresenta " +
  "apresentando observa nota notase associado associada demai estrutura outra outro regiao direito direita esquerdo esquerda bilateral " +
  "nivel area medindo mede cerca anterior posterior superior inferior lado lateral medial proximal distal terco segmento parcial total " +
  "parte ambo ambas tambem ainda quando onde como mai menos").split(" "));
export function palavrasChave(textos) {
  const out = new Map();
  for (const w of palavrasDe(textos.join(" "))) {
    if (w.length < 4 || GENERICAS.has(w) || /^\d/.test(w)) continue;
    const r = w.slice(0, Math.max(4, Math.min(w.length, 6)));
    if (!out.has(r)) out.set(r, alternativas(r, true));
  }
  return [...out.values()];
}
export function citaPalavras(texto, chaves) {
  const ws = palavrasDe(texto);
  return chaves.some((alts) => ws.some((x) => bateAlt(x, alts)));
}

// descrição/título do exame com siglas e nomes por extenso, para "tc torax" achar "TOMOGRAFIA ... DO TÓRAX" e vice-versa
const SIGLAS = [
  ["tomografia computadorizada", "tc"], ["tomografia", "tc"], ["angiotomografia", "angio tc"], ["ressonancia magnetica", "rm"],
  ["ressonancia", "rm"], ["angiorressonancia", "angio rm"], ["colangiorressonancia", "colangio rm"], ["ultrassonografia", "us"],
  ["ultrassom", "us"], ["ecografia", "us"], ["doppler", "us doppler"], ["mamografia", "mmg"], ["radiografia", "rx"],
  ["raio x", "rx"], ["densitometria", "dmo"], ["cranio", "encefalo"], ["encefalo", "cranio"],
  ["abdomen", "abdome"], ["abdome", "abdomen"], ["torax", "pulmao"],
];
const MODALIDADES = { ct: "tc", mr: "rm", us: "us", dx: "rx", cr: "rx", mg: "mmg", nm: "medicina nuclear", pt: "pet", xa: "angiografia", rf: "fluoroscopia", bmd: "dmo" };
export function textoDoExame(desc, mod = "", titulo = "") {
  let t = " " + palavrasDe(`${desc} ${titulo}`).join(" ") + " ";
  for (const [a, b] of SIGLAS) if (t.includes(" " + a + " ")) t += " " + b + " ";
  for (const m of normalizar(mod).split(" ")) if (MODALIDADES[m]) t += " " + MODALIDADES[m] + " ";
  return t;
}

// filtro de exame -> modalidades do portal (para o próprio portal já mandar só elas): "tc torax; rm cranio" -> ["CT","MR"]
// se alguma alternativa não indicar modalidade, devolve [] (não dá para restringir)
const SIGLA_MOD = { tc: "CT", angiotomografia: "CT", tomografia: "CT", rm: "MR", ressonancia: "MR", angiorressonancia: "MR", colangiorressonancia: "MR",
  us: "US", ultrassonografia: "US", ultrassom: "US", doppler: "US", ecografia: "US", mmg: "MG", mamografia: "MG" };   // rx: DX ou CR, não restringe
export function modalidadesDoFiltro(expr) {
  const mods = new Set();
  for (const parte of String(expr || "").split(/[;\n]+/)) {
    if (!parte.trim()) continue;
    const ws = normalizar(parte).split(" ");
    const m = ws.map((w) => SIGLA_MOD[w] || Object.entries(SIGLA_MOD).find(([k]) => k.length > 3 && w.startsWith(k))?.[1]).find(Boolean);
    if (!m) return [];
    mods.add(m);
  }
  return [...mods];
}

export function filtrosVazios(f) {
  return !f || !["medico", "exame", "indicacao", "achados"].some((k) => String(f[k] || "").trim()) &&
    !f.sexo && f.idadeMin == null && f.idadeMax == null && !f.pularNormais && !f.data;
}

const ONDE = { laudo: "laudo todo", achados: "só nos achados", conclusao: "só na conclusão" };
const DATAS = { hoje: "hoje", d3: "últimos 3 dias", d7: "últimos 7 dias", d30: "últimos 30 dias", m3: "últimos 3 meses", m6: "últimos 6 meses", m12: "últimos 12 meses" };
export function descreverData(f) {
  if (!f?.data) return "";
  if (f.data === "periodo") return `de ${f.dataDe || "?"} até ${f.dataAte || "hoje"}`;
  return DATAS[f.data] || "";
}
export function descreverFiltros(f) {
  if (filtrosVazios(f)) return "sem filtro (todos os laudos da busca)";
  const p = [];
  if (f.data) p.push(`data: ${descreverData(f)}`);
  if (f.medico?.trim()) p.push(`médico: ${f.medico.trim()}`);
  if (f.exame?.trim()) p.push(`exame: ${f.exame.trim()}`);
  if (f.indicacao?.trim()) p.push(`indicação: ${f.indicacao.trim()}`);
  if (f.achados?.trim()) {
    const extras = [ONDE[f.onde] && f.onde !== "laudo" ? ONDE[f.onde] : "", f.ignorarNegados === false ? "" : "ignorando negados", f.sinonimos ? "com sinônimos" : ""].filter(Boolean);
    p.push(`achados: ${f.achados.trim()}${extras.length ? ` (${extras.join(", ")})` : ""}`);
  }
  if (f.sexo) p.push(`sexo: ${f.sexo}`);
  if (f.idadeMin != null || f.idadeMax != null) p.push(`idade: ${f.idadeMin ?? 0}–${f.idadeMax ?? "∞"}`);
  if (f.pularNormais) p.push("pulando laudos 100% normais");
  return p.join(" · ");
}

// ---------- etiquetas (achados citados no laudo, sem negação) ----------
// um nome por grupo de CONCEITOS, na mesma ordem
const NOMES_CONCEITOS = [
  "neoplasia/massa", "metástase", "litíase", "esteatose", "derrame pleural", "ascite", "linfonodomegalia", "trombose/embolia",
  "fratura", "aneurisma", "cisto", "nódulo", "estenose", "hidronefrose", "hepatomegalia", "esplenomegalia", "cardiomegalia",
  "consolidação/pneumonia", "atelectasia", "isquemia/AVC", "hemorragia/hematoma", "abscesso/coleção", "hérnia discal",
  "apendicite", "diverticulite", "colecistite", "pancreatite", "obstrução", "espessamento parietal", "enfisema", "bronquiectasia",
];
const TERMOS_CONCEITOS = CONCEITOS.map((g) => g.map((frase) => ({ p: frase.map((w) => [w]), frase: true })));

// texto do laudo (achados + conclusão) -> ["nódulo", "esteatose", ...]
export function etiquetas(texto) {
  const frases = frasesDe(texto);
  const out = [];
  TERMOS_CONCEITOS.forEach((g, i) => {
    if (g.some((termo) => frases.some((p) => achadoNaFrase(p, termo, true)))) out.push(NOMES_CONCEITOS[i]);
  });
  return out;
}
