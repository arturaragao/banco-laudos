// Divide o laudo em título e seções (indicação, técnica, achados, conclusão...) e separa o que é alteração.
// Entrada: parágrafos de htmlParaParagrafos() — cada um é uma lista de trechos {t, b, i, u}.
import { textoDoParagrafo } from "./laudo2notion.js";
import { normalizar, frasesDe, achadoNaFrase } from "./filtros.js";

// cabeçalhos de seção conhecidos -> chave
const SECOES = [
  [/^indica[çc][ãa]o(\s+cl[íi]nica)?|^hist[óo]ria\s+cl[íi]nica|^dados\s+cl[íi]nicos|^informa[çc][õo]es\s+cl[íi]nicas|^motivo(\s+do\s+exame)?/i, "indicacao"],
  [/^t[ée]cnica|^protocolo|^m[ée]todo/i, "tecnica"],
  [/^achados?(\s+adicionai?s)?|^relat[óo]rio|^descri[çc][ãa]o|^an[áa]lise(?!\s+comparativa)/i, "achados"],
  [/^an[áa]lise\s+comparativa|^estudo\s+comparativo|^compara[çc][ãa]o/i, "comparacao"],
  [/^conclus[ãa]o|^impress[ãa]o(\s+diagn[óo]stica)?|^opini[ãa]o|^diagn[óo]stico|^s[íi]ntese/i, "conclusao"],
  [/^coment[áa]rios?|^observa[çc][õo]es|^obs\b|^nota\b|^adendo/i, "comentarios"],
  [/^recomenda[çc][õo]es|^recomenda[çc][ãa]o|^sugest[ãa]o|^conduta/i, "recomendacao"],
];

// "Técnica: Exame de..." -> {chave: "tecnica", resto: "Exame de..."}; parágrafo comum -> null
function cabecalho(texto) {
  const t = texto.trim();
  for (const [re, chave] of SECOES) {
    const m = t.match(re);
    if (!m) continue;
    const resto = t.slice(m[0].length);
    // é cabeçalho se acaba ali, ou vem seguido de ":" (texto na mesma linha), ou é curto sem ponto final
    const r = resto.match(/^\s*[:\-–]\s*(.*)$/s);
    if (r) return { chave, resto: r[1].trim() };
    if (!resto.trim() || (t.length <= 40 && !/[.]$/.test(t))) return { chave, resto: "" };
  }
  return null;
}

const ehMaiusculo = (l) => l.length > 3 && l === l.toLocaleUpperCase("pt-BR") && /\p{L}{3}/u.test(l);

// título: TODAS as linhas em maiúsculas do começo, juntas ("ANGIOTOMOGRAFIA COMPUTADORIZADA" + "DA VEIA CAVA...")
export function separarTitulo(pars) {
  let i = 0;
  while (i < pars.length && !textoDoParagrafo(pars[i]).trim()) i++;
  const linhas = [];
  while (i < pars.length) {
    const l = textoDoParagrafo(pars[i]).trim();
    if (!ehMaiusculo(l) || cabecalho(l) || /:$/.test(l) || l.length > 150) break;
    linhas.push(l);
    i++;
    if (linhas.length >= 4) break;
  }
  return { titulo: linhas.join(" ").replace(/\s+/g, " ").replace(/[.\s]+$/, ""), inicio: i };
}

// -> {titulo, secoes: {indicacao: [par...], achados: [...], conclusao: [...], ...}, ordem: [{chave, pars}]}
// parágrafos antes do 1º cabeçalho (ex.: radiografias sem seções) entram como "achados"
export function dividirLaudo(pars) {
  const { titulo, inicio } = separarTitulo(pars);
  const secoes = {};
  const ordem = [];
  let atual = null;
  const abrir = (chave) => { atual = { chave, pars: [] }; ordem.push(atual); (secoes[chave] ||= []); };
  for (let k = inicio; k < pars.length; k++) {
    const p = pars[k];
    const txt = textoDoParagrafo(p).trim();
    if (!txt) continue;
    const cab = cabecalho(txt);
    if (cab) {
      abrir(cab.chave);
      if (cab.resto) {
        const seg = [{ t: cab.resto, b: false, i: false, u: false }];
        atual.pars.push(seg); secoes[cab.chave].push(seg);
      }
      continue;
    }
    if (!atual) abrir("achados");
    atual.pars.push(p);
    secoes[atual.chave].push(p);
  }
  return { titulo, secoes, ordem };
}

// ---------- o que é alteração ----------
// termos que indicam achado anormal (começo da palavra); negados na mesma frase não contam
const ANORMAL = [
  "aument", "reduz", "diminu", "espess", "nodul", "lesa", "lesoe", "cist", "calcul", "litias", "esteatos", "estenos", "ateroma",
  "ateromat", "calcific", "derrame", "fratur", "hernia", "herniac", "protrus", "abaulament", "degenerat", "rotura", "ruptur",
  "tendinop", "tendinos", "edema", "colec", "massa", "neoplas", "tumor", "linfonodomegal", "adenomegal", "dilat", "ectasia",
  "aneurism", "tromb", "opacidad", "consolid", "atelect", "enfisem", "bronquiect", "hipodens", "hiperdens", "hipoatenua",
  "hiperatenua", "hiperintens", "hipointens", "sugestiv", "compativ", "suspeit", "possibilidade", "indetermin",
  "alterac", "anomal", "irregular", "heterogen", "infiltr", "inflamat", "infecc", "abscess", "isquem", "infart", "hemorrag",
  "hematoma", "obstru", "oclus", "desvio", "escoliose", "listese", "anterolist", "retrolist", "osteofit", "artrose", "osteopen",
  "osteopor", "esclerose", "atrofia", "gliose", "microangiop", "leucoaraiose", "sinusopat", "polipo", "polip", "mioma", "adenoma",
  "hemangioma", "metast", "secundarism", "pneumotor", "pneumoperit", "ascite", "hidronefr", "hepatomegal", "esplenomegal",
  "cardiomegal", "bocio", "atelectas", "vidro fosco", "bronquiol", "fibrose", "cicatri", "sequela", "protese",
  "corpo estranho", "sindesmofit", "entesof", "bursite", "sinovite", "condropat", "condromalac", "meniscopat", "lacera",
  "fissura", "dissec", "espondil", "discopat", "uncoartr", "artropat", "espondilolist",
];
// variações anatômicas e achados "menores": não entram no resumo, mas tiram o laudo da categoria 100% normal
const VARIACOES = [
  "variac", "variant", "acessori", "bifid", "duplic", "hipoplas", "agenes", "ectop", "persistenc", "septad", "lobulac",
  "fusao", "rotac", "assimetri", "proeminen", "calcif", "granulom", "cisto", "divertic", "hipertrof", "aderenc",
  "incidental", "achado adicional", "incipiente", "discret", "pequen", "leve", "minim",
];
const NORMAL_FRASE = /dentro dos limites d[ae] normalidade|sem alterac|aspecto normal|exame normal|sem anormalidade|nao ha alterac|estudo normal|normal para a faixa etaria/;

const termos = (lista) => lista.map((t) => ({ p: t.split(" ").map((w) => [w]), frase: t.includes(" ") }));
const TERMOS_ANORMAL = termos(ANORMAL);
const TERMOS_NAO_NORMAL = termos([...ANORMAL, ...VARIACOES]);
function fraseAnormal(palavras) {
  return TERMOS_ANORMAL.some((termo) => achadoNaFrase(palavras, termo, true));
}
const fraseNaoNormal = (palavras) => TERMOS_NAO_NORMAL.some((termo) => achadoNaFrase(palavras, termo, true));

// o parágrafo descreve alguma alteração? (heurística: algum termo de anormalidade não negado)
export function paragrafoAlterado(par) {
  return frasesDe(textoDoParagrafo(par)).some(fraseAnormal);
}

// laudo 100% normal: a conclusão diz que é normal E nada no corpo do laudo (achados, comparação, comentários,
// achados adicionais, conclusão) descreve alteração ou variação anatômica. Na dúvida, NÃO é normal (não é pulado).
export function laudoNormal(div) {
  const conc = (div.secoes.conclusao || []).map(textoDoParagrafo).join(". ");
  if (!conc.trim() || !NORMAL_FRASE.test(normalizar(conc))) return false;
  const corpo = ["achados", "comparacao", "comentarios", "recomendacao", "conclusao"].flatMap((c) => div.secoes[c] || []);
  return !corpo.some((p) => frasesDe(textoDoParagrafo(p)).some(fraseNaoNormal));
}

export { cabecalho };

// ---------- conclusão numerada e resumo curto ----------
const NUMERACAO = /^\s*(?:\d{1,2}\s*[).\-–:]|[-–•*])\s*/;
// itens da conclusão, sem a numeração original (para numerar de novo: 1., 2., 3.)
export function itensConclusao(div) {
  return (div.secoes.conclusao || []).map((p) => textoDoParagrafo(p).replace(NUMERACAO, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}
export const conclusaoNumerada = (div) => itensConclusao(div).map((t, i) => `${i + 1}. ${t}`).join("\n");

// Resumo = só os diagnósticos da conclusão, curtos: "CAM. Condropatia de baixo grau. Ossificações periacetabulares. Rotura labrum."
// Versão das regras: quando muda, os resumos já guardados são refeitos na próxima sincronização.
export const RESUMO_VERSAO = 8;

// recomendações e frases de "o resto é normal": não entram
const DESCARTA = /^(sugere se|sugerimos|recomenda se|recomendamos|controle evolutivo|seguimento|correlacionar|correlacao|a criterio|considerar|demais (estruturas|achados|aspectos|orgaos|segmentos)|restante do (exame|estudo)|sem outras alterac|nao ha outras|ausencia de outras|nota |obs |(analise )?comparativ|em comparacao|comparad|quando comparad|em relacao (ao|aos|a|com) (o |os )?(exame|estudo|controle)|estabilidade|estave(l|is)|inalterad|sem (alteracoes|modificacoes|mudancas) (significativas |evolutivas )|(nao )?(dispomos|ha|houve) (de )?exames? (anterior|previo)|exames? (anterior|previo)|ausencia de exames)/;
// abertura da conclusão: "Estudo por tomografia computadorizada de tórax mostra" sai
const INTRO = /^(?:o |a )?(?:presente |atual )?(?:estudo|exame|avaliacao|analise|controle)\b[^,.;]{0,90}?\b(?:mostra|mostrou|demonstra|demonstrou|evidencia|evidenciou|revela|revelou|identifica|identificou|caracteriza|apresenta|exibe|nota-se)\s*:?\s*/g;
// achados pouco relevantes (pedido do Artur): não entram no resumo
const IRRELEVANTE = /(?:^(?:discreto |pequeno |leve |minimo )?(?:aumento|quantidade) (?:de |do )?liquido|^(?:pequeno|discreto|minimo|leve|pequena quantidade de) (?:derrame|liquido)|heterogene[oa]s? sem (?:evidencia|sinais)|nao (?:foi )?(?:identificad|caracterizad)[oa].*(?:pode|podendo|relacionad)|^(?:discretas |leves )?alteracoes degenerativas osteocondrais)/;
// análise comparativa no meio do item: sai ("..., estável em relação ao exame anterior")
const COMPARACAO = /\s*[,;(]?\s*(?:(?:sem alteracoes|sem modificacoes|sem mudancas)(?: significativas| evolutivas)?|inalterad[oa]s?|estave(?:l|is)|sem crescimento|em reducao|em aumento|reduzid[oa]s?|aumentad[oa]s?)?\s*(?:quando |se )?(?:em relacao|comparad[oa]s?|comparativamente|em comparacao|em confronto)\s+(?:a[o]?s?|com(?: o| os)?)\s+(?:\S+\s+)?(?:exames?|estudos?|controles?)\b[^;]*$|\s*,\s*(?:estave(?:l|is)|inalterad[oa]s?)(?=$|[,;])/g;
// classificações: "Lesão PI-RADS 5", "Nódulo BI-RADS 4A", "Cisto Bosniak IIF"
const RADS = /\b(pi|bi|li|ti|o|c|ni|lung|cad)[\s-]?rads(?:\s*(?:categoria|cat\.?|[:\-–]))*\s*(\d[a-c]?)?/;
const BOSNIAK = /\bbosniak(?:\s*(?:categoria|cat\.?|[:\-–]))*\s*(iv|i{1,3}f?|\d\s?f?)?/;
const NUCLEO = /\b(lesao|lesoes|nodulo|nodulos|massa|massas|cisto|cistos|calcificacoes|formacao|foco|area|imagem)\b/;
// cirurgia prévia: "Sinais de manipulação cirúrgica prévia ... na cabeça umeral" -> "Cx cabeça umeral"
const CIRURGIA = /(?:manipulacao|abordagem|intervencao|reconstrucao|reparo) cirurgic|pos-?operatori|pos-?cirurgic|status cirurgic/;
// coluna: discos não são especificados ("Discopatia degenerativa em L3-L4 e L4-L5" -> "Discopatia degenerativa"); hérnias mantêm o nível
const DISCO_SEM_NIVEL = /discopatia|abaulamento|desidrat|degeneracao discal|osteofit|uncoartrose|espondilo|artrose (?:facet|interapofis)|protrus.*difus/;
// as regras olham o texto sem acento e em minúsculas (mesmo tamanho do original) e cortam o original nas mesmas posições
const espelho = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function aplicar(x, re, troca) {
  const m = espelho(x);
  let out = "", ult = 0;
  for (const r of m.matchAll(re)) {
    out += x.slice(ult, r.index) + (typeof troca === "function" ? troca(x.slice(r.index, r.index + r[0].length), r) : troca);
    ult = r.index + r[0].length;
  }
  return out + x.slice(ult);
}
// medidas: "de 8 mm", "medindo 1,2 x 0,8 cm", "com cerca de 15 ml"
const MEDIDA = /\s*,?\s*(?:(?:de|com|medindo|mede|que mede|com cerca de|cerca de|de cerca de|de aproximadamente|aproximadamente|ate|de ate|com ate|com volume de|volume de|estimad[oa] em|em torno de|com diametro de|diametro de|maior diametro de)\s+)*~?\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×|por)\s*\d+(?:[.,]\d+)?)*\s*(?:mm|cm|ml|cm3|cm³|cc|g|hu|uh|%)(?![a-z0-9])/g;
// a conclusão de verdade vem depois destes termos: pega o que vem depois do ÚLTIMO
const VIRADA = /(?:^|[\s,;(])(?:compative(?:l|is) com|sugestiv[oa]s? de|sugerindo|sugere|podendo (?:representar|corresponder a|tratar-se de|estar relacionad[oa]s? (?:a|ao|com)|ser)|que pode(?:m)? (?:representar|corresponder a)|devendo(?:-se)? (?:ser )?considerar(?:-se)?|a considerar|considerar|predispondo a[o]?s?|caracterizando|indicando|indicativ[oa]s? de|em relacao (?:com|a[o]?)|relacionad[oa]s? (?:a[o]?s?|com)|provavelmente|provave(?:l|is)|favorecendo|inferindo|correspondendo a[o]?|representando|devid[oa]s? a[o]?)\s+/g;
// começo burocrático: "Evidências de rotura" -> "rotura"
const ENFEITE = /^(?:(?:os|as|o|a|um|uma|ao|aos)\s+)?(?:(?:achados?|aspectos?|sinais?|imagens?|quadro|evidencias?|presenca|area|areas|foco|focos|suspeitas?|manifestac(?:ao|oes)|possibilidade|possive(?:l|is))\s+(?:(?:tomografic|ecografic|radiologic|de imagem)\S*\s+)?(?:de|da|do|dos|das|com)\s+|(?:nota-se|observa-se|identifica-se|ha|existe|existem)\s+)/;
const ARTIGO = /^(?:o|a|os|as|um|uma|ao|aos|à|às)\s+/;
// depois da preposição de lugar, estas palavras são pulos ("na região periacetabular" -> "periacetabular")
const PULOS = new Set(["regiao", "topografia", "nivel", "segmento", "quadrante", "porcao", "terco", "face", "altura", "projecao", "parte", "transicao", "aspecto",
  "componente", "componentes"]);
// direções antes da estrutura ("quadrante póstero-superior do labrum" -> "labrum")
const DIRECAO = /^(?:antero|postero|supero|infero|latero|medio|anterior|posterior|superior|inferior|medial|lateral|proximal|distal|central|periferic)/;
// adjetivo que faz parte do nome da estrutura ("manguito rotador", "cápsula articular", "recesso axilar", "lobo inferior")
const ADJ_ESTRUTURA = /^[a-z\-]{3,}(?:ar|al|or|ares|ais|ores)$/;
// achados importantes que vêm depois da vírgula e não podem sumir ("Tendinopatia..., com rupturas parciais")
const IMPORTANTE = /(?:^|\s)((?:rotura|ruptura|fratura|fissura|lesao|trombo|trombose)s?)(\s+(?:parcia(?:l|is)|complet[ao]s?|tota(?:l|is)|transfixantes?|instave(?:l|is)|desviad[ao]s?))?(?![a-z])/;
// preposições seguidas destas palavras não são lugar ("de baixo grau", "de pequeno volume")
const PROTEGE = /^(?:baixo|alto|medio|grau|pequen|grande|moderad|leve|acentuad|aspecto|natureza|carater|padrao|origem|provavel|etiologia|significado|esforco|espessura)/;
const ABREV = [[/impacto femoro-?acetabular/g, "IFA"], [/doenca pulmonar obstrutiva cronica/g, "DPOC"], [/acidente vascular (?:cerebral|encefalico)/g, "AVC"],
  [/tromboembolismo pulmonar/g, "TEP"], [/trombose venosa profunda/g, "TVP"], [/hiperplasia nodular focal/g, "HNF"], [/ligamento cruzado anterior/g, "LCA"],
  [/ligamento cruzado posterior/g, "LCP"], [/doenca hepatica gordurosa/g, "esteatose"],
  [/(?:alteracoes|sinais) (?:osteo)?degenerativ[oa]s (?:n[oa]s?|d[oa]s?) articulac(?:ao|oes)\s+/g, "artrose "],
  [/componentes do manguito rotador/g, "manguito rotador"], [/cabeca longa do (?:musculo )?biceps(?: braquial)?/g, "bíceps"],
  [/(?:labrum|labio) (?:glenoideo|glenoide|glenoidal|acetabular)/g, "labrum"], [/labrum/g, "labrum"],
  [/acromio-clavicular/g, "acromioclavicular"], [/\s+\/\s+/g, "/"],
  [/hiperplasia prostatica(?: benigna)?/g, "HPB"],
  [/(?:desidratacao|degeneracao) (?:d[oa]s? )?discos?(?: intervertebra(?:l|is))?|(?:desidratacao|degeneracao|alteracoes degenerativas) disca(?:l|is)|discopatias? degenerativas?(?: disca(?:l|is))?/g, "discopatia degenerativa"]];

function encurtar(t, max) {
  if (t.length <= max) return t;
  const c = t.slice(0, max);
  return c.slice(0, Math.max(c.lastIndexOf(" "), max - 15)).replace(/[,;:\s]+$/, "") + "…";
}

// um item da conclusão -> o diagnóstico, curto
export function diagnostico(t) {
  let x = String(t || "").replace(/[.;:]+$/, "").trim();
  x = aplicar(x, INTRO, "");
  x = x.replace(/\s*\([^)]{25,}\)/g, "");                          // parênteses longos
  x = aplicar(x, /\s*\([^)]*\d\s*(?:mm|cm|ml)[^)]*\)/g, "");        // parênteses com medida
  x = aplicar(x, MEDIDA, "");
  x = aplicar(x, COMPARACAO, "");
  const m0 = espelho(x);
  // classificação (PI-RADS, BI-RADS, Bosniak...): o achado + a categoria
  const rads = m0.match(RADS), bos = m0.match(BOSNIAK);
  if (rads || bos) {
    const nucleo = m0.match(NUCLEO);
    const nome = nucleo ? x.substr(nucleo.index, nucleo[0].length) : "";
    const cls = rads ? `${rads[1] === "lung" ? "Lung" : rads[1].toUpperCase()}-RADS${rads[2] ? " " + rads[2].toUpperCase() : ""}`
      : `Bosniak${bos[1] ? " " + bos[1].replace(/\s/g, "").toUpperCase() : ""}`;
    return ((nome ? nome.charAt(0).toUpperCase() + nome.slice(1) + " " : "") + cls).trim();
  }
  // cirurgia prévia: "Cx" + o lugar
  if (CIRURGIA.test(m0)) {
    const locs = [...m0.matchAll(/\s(?:n[oa]s?|d[oa]s?|em)\s+/g)];
    let lugar = "";
    for (let i = locs.length - 1; i >= 0 && !lugar; i--) {
      const resto = x.slice(locs[i].index + locs[i][0].length).replace(/[,;].*$/, "").trim();
      if (resto && resto.split(/\s+/).length <= 4 && !/\b(?:d[oa]s?|de|n[oa]s?|em)\b/.test(espelho(resto)) && !CIRURGIA.test(espelho(resto))) lugar = resto;
    }
    for (const [re, por] of ABREV) lugar = aplicar(lugar, re, por);
    return ("Cx " + lugar).trim();
  }
  // a conclusão depois de "compatível com", "sugestivo de", "podendo representar"...
  const viradas = [...espelho(x).matchAll(VIRADA)];
  if (viradas.length) {
    const v = viradas[viradas.length - 1];
    const resto = x.slice(v.index + v[0].length).trim();
    if (resto.length >= 3) x = resto;
  }
  for (let i = 0; i < 2; i++) {
    const m = espelho(x).match(ENFEITE);
    if (m && m[0].length < x.length) x = x.slice(m[0].length);
    const a = espelho(x).match(ARTIGO);
    if (a) x = x.slice(a[0].length);
  }
  x = aplicar(x, /\s*,?\s*(?:a|à) (?:direita|esquerda)|\s+bilateral(?:mente)?|\s+(?:direit|esquerd)[oa]s?(?![a-z])/g, "");
  x = aplicar(x, /\s+(?:do|de) tipo\s+/g, " tipo ");
  x = aplicar(x, /\s+(?:em|no|num) (?:contexto|cenario|paciente)\b.*$/g, "");
  for (const [re, por] of ABREV) x = aplicar(x, re, por);
  // trecho depois de vírgula ("..., comprimindo a raiz") sai — menos rotura/fratura/lesão ("..., com rupturas parciais")
  let extra = "";
  const virg = x.search(/,\s/);
  if (virg > 3) {
    const resto = x.slice(virg);
    const imp = espelho(resto).match(IMPORTANTE);
    if (imp) extra = ", com " + resto.substr(imp.index + imp[0].indexOf(imp[1]), imp[1].length + (imp[2] || "").length).trim();
    x = x.slice(0, virg);
  }
  // lugar: "Rotura no labrum do quadrante..." -> "Rotura labrum"; com 3+ palavras antes, o lugar sai ("Nódulo pulmonar sólido")
  for (const p of espelho(x).matchAll(/\s+(?:n[oa]s?|em|d[oa]s?|de|à|ao|aos|sobre|junto a[o]?)\s+/g)) {
    const depois = espelho(x.slice(p.index + p[0].length));
    if (PROTEGE.test(depois)) continue;
    const cabeca = x.slice(0, p.index).trim();
    const palavras = x.slice(p.index + p[0].length).split(/\s+/);
    const nivel = palavras.find((w) => /^[ctls]\d/i.test(w));
    let k = 0;
    const pula = (w) => PULOS.has(w) || /^(?:d[oa]s?|de)$/.test(w) || (DIRECAO.test(w) && palavras.slice(k + 1).some((p) => /^(?:d[oa]s?|de)$/.test(espelho(p))));
    while (k < palavras.length - 1 && pula(espelho(palavras[k]))) k++;
    const k0 = k;
    let alvo = (palavras[k] || "").replace(/[,.;]+$/, "");
    const prox = espelho(palavras[k + 1] || "");
    if (alvo && ADJ_ESTRUTURA.test(prox)) { alvo += " " + palavras[k + 1]; k++; }
    const tamCabeca = cabeca.split(/\s+/).filter((w) => w !== "e").length;
    const restoTodo = palavras.slice(k0).join(" ").replace(/[,.;]+$/, "");
    const restoSimples = restoTodo && palavras.length - k0 <= 6 && !palavras.slice(k0).some((w) => /^(?:n[oa]s?|d[oa]s?|de|em|com|a|ao|aos|para|por|sobre)$/.test(espelho(w)));
    if (nivel) x = DISCO_SEM_NIVEL.test(espelho(cabeca)) && !/hernia|extrus/.test(espelho(cabeca)) ? cabeca : `${cabeca} ${nivel}`;
    // o lugar é curto e sem mais preposições: fica todo ("Lesão ligamentos glenumeral médio e inferior");
    // com o achado longo, a preposição também fica ("Tendinopatia e rupturas laminares intra-substanciais no subescapular")
    else if (restoSimples && tamCabeca <= 2) x = `${cabeca} ${restoTodo}`;
    else if (restoSimples && tamCabeca <= 6) x = k0 === 0 ? `${cabeca}${x.slice(p.index, p.index + p[0].length)}${restoTodo}` : `${cabeca} ${restoTodo}`;
    else if (tamCabeca <= 2 && alvo) {
      if (/s$/i.test(cabeca) && /(?:ar|al)$/i.test(alvo)) alvo = alvo.replace(/ar$/i, "ares").replace(/al$/i, "ais");
      x = `${cabeca} ${alvo}`;
      // estrutura curta seguida de outro lugar com "no/na": fica ("Espessamento cápsula articular no recesso axilar")
      const mais = palavras.slice(k + 1).join(" ").match(/^(n[oa]s?)\s+(\S+(?:\s+\S+)?)$/i);
      if (mais && x.split(/\s+/).length <= 3) x += ` ${mais[1]} ${mais[2]}`;
    } else x = cabeca;
    break;
  }
  for (const [re, por] of ABREV) x = aplicar(x, re, por);
  // coluna: níveis dos discos saem
  if (DISCO_SEM_NIVEL.test(espelho(x)) && !/hernia|extrus/.test(espelho(x)))
    x = aplicar(x, /(?:\s*(?:,|e|a|ate|entre|de|em|n[oa]s?|nos niveis|niveis)?\s+)*\b[ctls]\d{1,2}(?:\s*[-/]\s*[ctls]?\d{1,2})?(?![a-z0-9])/g, "");
  x = x.replace(/\s{2,}/g, " ").replace(/[\s,;:.\-–]+$/, "").trim() + extra;
  return encurtar(x.charAt(0).toUpperCase() + x.slice(1), 80);
}

// conclusão com as palavras importantes (as que ficam no resumo) em negrito + sublinhado
const VAZIAS = new Set(["com", "sem", "dos", "das", "nos", "nas", "por", "que", "uma", "tipo", "para", "pela", "pelo", "entre", "sobre"]);
export function destacarConclusao(p) {
  const txt = textoDoParagrafo(p).replace(NUMERACAO, "");
  const d = diagnostico(txt);
  if (!d || /^sem alteracoes/.test(espelho(d))) return p;
  const chaves = new Set(espelho(d).split(/[^a-z0-9-]+/).filter((w) => w.length >= 3 && !VAZIAS.has(w)));
  if (!chaves.size) return p;
  const toks = [];
  for (const s of p) {
    for (const tok of String(s.t).split(/([^\p{L}\p{N}-]+)/u)) {
      if (!tok) continue;
      const imp = chaves.has(espelho(tok));
      toks.push({ ...s, t: tok, imp, b: !!s.b || imp, u: !!s.u || imp });
    }
  }
  // espaço entre duas palavras destacadas também fica destacado ("manguito rotador" num trecho só)
  for (let i = 1; i < toks.length - 1; i++) {
    if (!toks[i].imp && /^ +$/.test(toks[i].t) && toks[i - 1].imp && toks[i + 1].imp) { toks[i].b = true; toks[i].u = true; }
  }
  const out = [];
  for (const { imp, ...s } of toks) {
    const ult = out[out.length - 1];
    if (ult && ult.b === s.b && ult.i === s.i && ult.u === s.u) ult.t += s.t;
    else out.push({ t: s.t, b: s.b, i: !!s.i, u: s.u });
  }
  return out;
}

// resumo de 1 linha: todos os diagnósticos da conclusão, na ordem do laudo. Laudo normal -> "Sem alterações."
export function resumoLaudo(div, max = 12) {
  const todos = itensConclusao(div);
  const itens = todos.filter((t) => {
    const n = normalizar(t);
    return !DESCARTA.test(n) && !NORMAL_FRASE.test(n) && !IRRELEVANTE.test(n);
  }).map(diagnostico).filter((t) => t.length > 1);
  const unicos = [...new Map(itens.map((t) => [espelho(t), t])).values()];
  if (!unicos.length) {
    if (laudoNormal(div) || todos.some((t) => NORMAL_FRASE.test(normalizar(t)))) return "Sem alterações.";
    // sem conclusão: a 1ª frase dos parágrafos alterados dos achados
    const alt = ["achados", "comparacao", "comentarios"].flatMap((c) => div.secoes[c] || []).filter(paragrafoAlterado)
      .map((p) => textoDoParagrafo(p).split(/(?<=\.)\s/)[0].trim()).filter(Boolean);
    return alt.slice(0, 2).map(diagnostico).filter(Boolean).map((t) => t + ".").join(" ");
  }
  const mais = unicos.length > max ? ` (+${unicos.length - max})` : "";
  return unicos.slice(0, max).map((t) => t + ".").join(" ") + mais;
}
