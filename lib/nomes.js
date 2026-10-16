// Nomes padronizados para mostrar e agrupar (só no app; as libs copiadas da extensão não mudam):
//   exame:  "TC DE TÓRAX" / "TC TÓRAX" / "TOMOGRAFIA COMPUTADORIZADA DO TÓRAX" -> "TC TÓRAX"; ABDÔMEN/ABDOMEN -> ABDOME
//   médico: "DR. JOÃO DA SILVA" / "Dra. maria souza" -> "João da Silva" / "Maria Souza"
import { abreviarTitulo } from "./laudo2notion.js";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "");
export const chaveNome = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

export function tituloExame(t) {
  let s = abreviarTitulo(String(t || "")).toUpperCase();
  s = s.replace(/\bANGIO-?TOMOGRAFIA(?: COMPUTADORIZADA)?\b/g, "ANGIO-TC").replace(/\bTOMOGRAFIA(?: COMPUTADORIZADA)?\b/g, "TC")
    .replace(/\bANGIO-?RRESSON[ÂA]NCIA(?: MAGN[ÉE]TICA)?\b/g, "ANGIO-RM").replace(/\bRESSON[ÂA]NCIA(?: NUCLEAR)?(?: MAGN[ÉE]TICA)?\b/g, "RM")
    .replace(/\b(?:ULTRASSONOGRAFIA|ULTRA-?SSOM|ULTRASSOM|ECOGRAFIA|USG)\b/g, "US").replace(/\bRADIOGRAFIA\b/g, "RX")
    .replace(/\bABD[ÔO]M(?:EN|E)\b/g, "ABDOME")
    .replace(/(^|\s)(?:DE|DA|DO|DOS|DAS)(?=\s|$)/g, " ")
    .replace(/\s{2,}/g, " ").replace(/[\s.,;:\-–]+$/, "").trim();
  return s || "?";
}

const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e", "di", "du", "del", "van", "von"]);
export function nomeMedico(m) {
  let s = String(m || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:(?:dr|dra|drª|dr\(a\)|doutor|doutora|prof|profa)\.?\s+)+/i, "");
  return s.toLowerCase().split(" ").map((w, i) => (i && PARTICULAS.has(w) ? w
    : w.replace(/(^|[-'’])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase()))).join(" ");
}

// a grafia mais usada de cada nome (TÓRAX x TORAX) vira a oficial; devolve fn(nome) -> nome oficial
export function grafiaOficial(nomes) {
  const cont = new Map();
  for (const n of nomes) {
    const k = chaveNome(n);
    if (!cont.has(k)) cont.set(k, new Map());
    const m = cont.get(k);
    m.set(n, (m.get(n) || 0) + 1 + (/[ÁÉÍÓÚÂÊÔÃÕÇ]/i.test(n) ? 0.5 : 0));   // empate: fica a com acento
  }
  const oficial = new Map([...cont].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  return (n) => oficial.get(chaveNome(n)) || n;
}
