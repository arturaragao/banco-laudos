// Destaque da conclusão (negrito + sublinhado) só no que importa, por regras (sem IA):
//   • item normal, recomendação, comparação ou achado irrelevante: nada destacado;
//   • no item com alteração: o ACHADO (nódulo, ruptura, esteatose...) com os adjetivos que o qualificam ("Nódulo pulmonar
//     sólido"), o diagnóstico depois de "sugestivo de / compatível com" e as classificações (PI-RADS 4, Bosniak IIF);
//   • nunca: medidas, lateralidade, lugar ("no lobo superior direito"), "leve/discreto", trechos negados ("sem ...").
// Também dá a "gravidade" e os achados de cada item (usados na ordem por relevância).
import { textoDoParagrafo } from "./laudo2notion.js";

// texto sem acento e minúsculo, com o MESMO tamanho do original (para cortar o original nas mesmas posições)
export const espelho = (t) => Array.from(String(t), (c) => (c.length === 1 ? c.normalize("NFD")[0].toLowerCase() : c.replace(/./gu, " "))).join("");
const NUMERACAO = /^\s*\d{1,2}\s*[).\-–:]\s*/;

// item inteiro que não se destaca
const NADA = new RegExp([
  "^(demais|restante|restantes|resto)\\b", "^(sem|ausencia|nao ha|nao se|nao foram|nao foi|nao sao|nao houve|inexistencia)\\b",
  "^[^,;]{0,40}\\b(?:sem alteracoes|sem anormalidades|dentro (?:dos limites|da normalidade)|aspecto (?:normal|habitual)|normais?|habituais?|preservad[oa]s?)\\b[^,;]*$",
  "\\bnao se aplica\\b",
  "^(sugere|sugerimos|recomenda|recomendamos|controle|seguimento|correlac|a criterio|considerar|cabe|nota|obs)\\b",
  "^(estudo|exame|analise|avaliacao)\\s+(sem|dentro|normal|nos limites)",
  "^(estabilidade|estave|inalterad|sem modificac|sem mudanc|comparad|em comparacao|em relacao ao exame)",
  "^(?:pequen\\w*|discret\\w*|minim\\w*|leve|pequena quantidade de)\\s+(?:derrame|liquido|lamina)",
  "^(?:discretas?|leves?)?\\s*alteracoes degenerativas", "^(?:discreta |leve )?(?:espondilo|uncoartrose|ateromatose|ateroma)",
  "\\b(granulomas? calcificad|calcificac\\w* (vascular|ateromatos|parietais? vasculares)|cistos? simples|linfonodos? (reaciona|de aspecto habitual|nao aumentad)|flebolito)",
].join("|"));
// regiões negadas dentro do item ("..., sem sinais de complicação") não se destacam
const NEGADO = /\b(sem|nao|ausencia de|inexistencia de|afastad[oa]s?|descartad[oa]s?)\b[^,;.]*/g;

// achados (radicais, texto sem acento)
const ACHADOS = ["nodul", "massa", "lesao", "lesoes", "cist", "tumor", "neoplas", "carcinom", "metasta", "implantes? secundari", "secundarismo",
  "linfonodomegali", "adenomegali", "adenopati", "ruptura", "rotura", "fratura", "fissura", "hernia", "extrus", "protrus", "abaulament", "estenose",
  "trombo", "tromboembol", "embolia", "tep\\b", "aneurism", "disseccao", "hemorrag", "hematom", "sangramento", "abscess", "colecao", "consolidac",
  "atelectas", "derrame", "pneumotorax", "pneumoperitonio", "enfisema", "bronquiectas", "fibrose", "vidro fosco", "opacidade", "espessament",
  "esteatose", "cirrose", "hepatopatia", "litiase", "calculo", "nefrolitiase", "colelitiase", "coledocolitiase", "hidronefrose", "ureterohidronefrose",
  "apendicite", "diverticulite", "diverticulose", "colecistite", "pancreatite", "colite", "enterite", "ileite", "obstruc", "suboclus", "volvo",
  "invaginac", "perfurac", "isquemi", "infart", "edema", "contusao", "tendinopatia", "tendinose", "tenossinovite", "bursite", "artrose", "osteoartrose",
  "condropatia", "condromalac", "sinovite", "capsulite", "entesopatia", "osteonecrose", "necrose", "hpb", "hiperplasia", "esplenomegali",
  "hepatomegali", "ascite", "carcinomatose", "dilatac", "ectasi", "displasia", "malformac", "gliose", "microangiopat", "avc\\b", "desmielin",
  "atrofia", "hidrocefal", "sinusopatia", "sinusite", "otomastoidite", "mastoidite", "espondilodiscite", "osteomielite", "lipoma", "hemangioma",
  "adenoma", "angiomiolipoma", "varicocele", "hidrocele", "mioma", "leiomioma", "endometrioma", "endometriose", "adenomiose", "polip", "pneumonia",
  "broncopneumonia", "processo inflamatorio", "processo infeccioso", "infecc", "distensao", "laceracao", "luxacao", "subluxacao", "desinsercao",
  "degeneracao", "insuficiencia", "discopatia", "anterolistese", "retrolistese", "listese", "espondilolise", "escoliose", "cifose", "osteopenia",
  "osteoporose", "nefropatia", "pielonefrite", "cistite", "prostatite", "orquite", "epididimite", "torcao", "fistula", "estreitamento", "oclusao",
  "placa", "calcificac", "ateromatose", "bocio", "tireoidite", "linfoma", "mieloma", "sarcoma", "glioma", "meningioma", "schwannoma", "cisto",
  "megacolo", "fecaloma", "hepatocarcinoma", "chc\\b", "colangiocarcinoma", "dpoc\\b", "tvp\\b", "ifa\\b", "derrame articular", "sobrecarga",
  "impacto", "conflito", "hipertrofia", "cardiomegalia", "pericardi", "miocardi", "nodulos?", "imagem nodular", "formacao", "area de", "foco"];
const RE_ACHADO = new RegExp(`\\b(?:${ACHADOS.join("|")})[a-z]*`, "g");
// adjetivos ANTES do achado que valem destaque ("Volumoso derrame", "Múltiplos nódulos")
const ANTES = /^(?:volumos|extens|acentuad|important|grave|grande|multipl|numeros|difus|acentuad|severa|severo|maci|exuberante|complex|bilateral)/;
// palavras que encerram o trecho destacado
const PARA = new Set(["no", "na", "nos", "nas", "em", "medindo", "mede", "medem", "com", "e", "ou", "a", "ao", "aos", "as", "que", "sem", "para", "por",
  "entre", "junto", "associado", "associada", "associados", "associadas", "sugestivo", "sugestiva", "sugestivos", "sugestivas", "compativel",
  "compativeis", "podendo", "pode", "provavelmente", "possivelmente", "direito", "direita", "esquerdo", "esquerda", "bilateral", "bilaterais",
  "leve", "leves", "discreto", "discreta", "discretos", "discretas", "minimo", "minima", "pequeno", "pequena", "pequenos", "pequenas", "cerca",
  "aproximadamente", "ate", "envolvendo", "acometendo", "determinando", "causando", "localizado", "localizada", "situado", "situada", "nivel",
  "regiao", "topografia", "segmento", "lobo", "lobos", "terco", "aspecto", "caracteristicas", "padrao", "predominio", "predominando", "estavel",
  "inalterado", "inalterada", "reduzido", "reduzida", "previamente", "ja", "tambem", "ainda", "sobretudo", "principalmente", "anterior", "posterior",
  "superior", "inferior", "medial", "lateral", "proximal", "distal", "apical", "basal"]);
const PREP = new Set(["de", "do", "da", "dos", "das"]);
const VIRADA = /\b(?:compative(?:l|is) com|sugestiv[oa]s? de|sugerindo|podendo (?:representar|corresponder a)|que pode(?:m)? (?:representar|corresponder a)|indicativ[oa]s? de|caracterizando|representando|favorecendo)\s+/g;
const RADS = /\b(?:bi|ti|li|pi|o|lung)-?rads\W{0,3}(?:v?\s?2(?:[.,]1)?\W{0,3})?(?:categoria|cat\.?|tr|lr-?)?\W{0,3}(?:[0-6][abcx]?|m|tiv)\b|\bbosniak\W{0,3}(?:categoria|classe)?\W{0,3}(?:iv|i{1,3}(?:\s?f)?|[1-4](?:\s?f)?)\b/g;
const GRAVE = /\b(neoplas|carcinom|tumor|metasta|implantes? secundari|malign|suspeit|massa|aneurism|disseccao|tep\b|tromboembol|embolia|trombose|hemorrag|hematom|abscess|pneumotorax|pneumoperitonio|fratura|ruptura (?:complet|total|transfix)|rotura (?:complet|total|transfix)|obstruc|isquemi|infart|perfurac|apendicite|colecistite|pancreatite|avc\b|hidrocefal|herniac|carcinomatose|linfonodomegali|linfoma|sarcoma|glioma|hepatocarcinoma|colangiocarcinoma|volvo|torcao|osteomielite|espondilodiscite)/;
const RADS_ALTO = /(?:bi-?rads\W*[456]|pi-?rads\W*(?:v?\s?2(?:[.,]1)?\W*)?(?:categoria\W*)?[45]|li-?rads\W*(?:lr-?)?(?:[45]|m|tiv)|lung-?rads\W*4|ti-?rads\W*(?:tr)?[45]|o-?rads\W*[45]|bosniak\W*(?:iii|iv|[34]))/;

function palavrasDepois(m, ini) {
  // estende o trecho a partir de ini pelas palavras seguintes que qualificam o achado
  const re = /[a-z0-9\-]+|[^a-z0-9\-\s]/g;
  re.lastIndex = ini;
  let fim = ini, n = 0, usouPrep = false, x;
  while ((x = re.exec(m)) && n < 5) {
    const w = x[0];
    if (!/^[a-z]/.test(w)) break;                       // pontuação ou número
    if (m.slice(fim, x.index).trim()) break;
    if (PREP.has(w)) {
      // "Tendinopatia do supraespinal": a preposição + uma palavra entram (uma vez)
      const y = /^\s+([a-z\-]+)/.exec(m.slice(x.index + w.length));
      if (usouPrep || !y || PARA.has(y[1]) || PREP.has(y[1]) || /^\d/.test(y[1])) break;
      usouPrep = true;
      fim = x.index + w.length + y[0].length;
      re.lastIndex = fim;
      n += 2;
      continue;
    }
    if (PARA.has(w)) break;
    fim = x.index + w.length;
    n++;
  }
  return fim;
}

// aprendido com os negritos feitos à mão (lib/aprendizado.js): sempre = frases que o Artur destacou; nunca = palavras que ele tirou
const compilar = (apr) => ({
  sempre: apr?.sempre || [], nunca: new Set(apr?.nunca || []),
  re: (apr?.sempre || []).map((fr) => new RegExp(`(?<![a-z0-9])${fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?![a-z0-9])`, "g")),
});
export const SEM_APRENDIZADO = compilar(null);
let APR = SEM_APRENDIZADO;
export function definirAprendizado(apr) { APR = compilar(apr); }
export const aprendizado = () => APR;
// palavras de ligação que não ficam soltas na ponta de um trecho destacado
const LIGA = new Set(["de", "do", "da", "dos", "das", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "com", "ao", "por", "para"]);
const ALNUM = /[a-z0-9]/;
function aparar(m, marca) {
  for (let i = 0; i < m.length;) {
    if (!marca[i]) { i++; continue; }
    const a = i;
    let b = i;
    while (b < m.length && marca[b]) b++;
    let a2 = a, b2 = b;
    for (;;) {
      while (a2 < b2 && !ALNUM.test(m[a2])) a2++;
      const w = /^[a-z0-9-]+/.exec(m.slice(a2, b2));
      if (w && LIGA.has(w[0]) && a2 + w[0].length < b2) a2 += w[0].length; else break;
    }
    for (;;) {
      while (b2 > a2 && !ALNUM.test(m[b2 - 1])) b2--;
      const w = /[a-z0-9-]+$/.exec(m.slice(a2, b2));
      if (w && LIGA.has(w[0]) && b2 - w[0].length > a2) b2 -= w[0].length; else break;
    }
    marca.fill(0, a, a2);
    marca.fill(0, b2, b);
    i = b;
  }
}

// texto de um item -> {faixas: [[ini, fim]], normal, achados: [palavras], gravidade}
export function analisarItem(texto, apr = APR) {
  const t = String(texto || "").replace(NUMERACAO, "");
  const desloc = String(texto || "").length - t.length;
  const m = espelho(t);
  const vazio = { faixas: [], normal: true, achados: [], gravidade: 0 };
  const nada = !m.trim() || NADA.test(m);
  if (nada && !apr.re.length) return vazio;
  const negado = [];
  for (const x of m.matchAll(NEGADO)) negado.push([x.index, x.index + x[0].length]);
  const dentroNegado = (i) => negado.some(([a, b]) => i >= a && i < b);
  const faixas = [], achados = [];
  if (!nada) {
    for (const x of m.matchAll(RE_ACHADO)) {
      if (dentroNegado(x.index)) continue;
      let ini = x.index;
      const antes = /([a-z-]+)s+$/.exec(m.slice(Math.max(0, ini - 20), ini));
      if (antes && ANTES.test(antes[1])) ini -= antes[0].length;
      faixas.push([ini, palavrasDepois(m, x.index)]);
      achados.push(x[0]);
    }
    for (const x of m.matchAll(VIRADA)) {
      const ini = x.index + x[0].length;
      if (!dentroNegado(ini)) faixas.push([ini, palavrasDepois(m, ini)]);
    }
    for (const x of m.matchAll(RADS)) faixas.push([x.index, x.index + x[0].length]);
  }
  // máscara do que fica destacado: regras -> tira as palavras que o Artur tirou -> põe as frases que ele destacou
  const marca = new Uint8Array(m.length);
  for (const [a, b] of faixas) if (b > a) marca.fill(1, a, b);
  if (apr.nunca.size) for (const x of m.matchAll(/[a-z0-9][a-z0-9-]*/g)) if (apr.nunca.has(x[0])) marca.fill(0, x.index, x.index + x[0].length);
  aparar(m, marca);
  for (const re of apr.re) for (const x of m.matchAll(re)) if (!dentroNegado(x.index)) marca.fill(1, x.index, x.index + x[0].length);
  // trechos separados por um caractere só (espaço) viram um trecho
  for (let i = 1; i < m.length - 1; i++) if (!marca[i] && marca[i - 1] && marca[i + 1]) marca[i] = 1;
  const juntas = [];
  for (let i = 0; i < m.length; i++) {
    if (!marca[i]) continue;
    const a = i;
    while (i < m.length && marca[i]) i++;
    juntas.push([a, i]);
  }
  let gravidade = juntas.length ? 1 : 0;
  if (GRAVE.test(m.replace(NEGADO, " "))) gravidade += 3;
  if (RADS_ALTO.test(m)) gravidade += 4;
  return { faixas: juntas.map(([a, b]) => [a + desloc, b + desloc]), normal: !juntas.length, achados, gravidade };
}

// parágrafo [{t, b, i, u}] -> com o destaque novo (o negrito/sublinhado antigo da conclusão é trocado pelo daqui)
export function destacar(p, apr = APR) {
  const texto = textoDoParagrafo(p);
  const { faixas } = analisarItem(texto, apr);
  const out = [];
  let pos = 0;
  for (const s of p) {
    const t = String(s.t);
    for (let k = 0; k < t.length;) {
      const g = pos + k;
      const dentro = faixas.some(([a, b]) => g >= a && g < b);
      let fimTrecho = t.length;
      for (const [a, b] of faixas) for (const c of [a, b]) if (c > g && c - pos < fimTrecho) fimTrecho = c - pos;
      const pedaco = t.slice(k, fimTrecho);
      const ult = out[out.length - 1];
      const marca = { b: dentro, i: !!s.i, u: dentro };
      if (ult && ult.b === marca.b && ult.i === marca.i && ult.u === marca.u) ult.t += pedaco;
      else out.push({ t: pedaco, ...marca });
      k = fimTrecho;
    }
    pos += t.length;
  }
  return out;
}
