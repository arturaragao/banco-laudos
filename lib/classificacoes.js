// Classificações citadas no laudo, reconhecidas por regras (sem IA): BI-RADS, TI-RADS, LI-RADS, PI-RADS, Lung-RADS,
// O-RADS, Bosniak e Fleischner. Devolve rótulos curtos e padronizados ("PI-RADS 4", "Bosniak IIF", "Lung-RADS 4A").
const ROMANO = { 1: "I", 2: "II", 3: "III", 4: "IV" };
const REGRAS = [
  [/\bbi-?rads\W{0,3}(?:categoria|cat\.?)?\W{0,3}([0-6][abc]?)\b/gi, (m) => `BI-RADS ${m[1].toUpperCase()}`],
  [/\b(?:acr\W{0,2})?ti-?rads\W{0,3}(?:categoria|cat\.?)?\W{0,3}(?:tr\W?)?([1-5])\b/gi, (m) => `TI-RADS ${m[1]}`],
  [/\bli-?rads\W{0,3}(?:categoria|cat\.?)?\W{0,3}(?:lr\W?)?([1-5]|m|tiv|nc)\b/gi, (m) => `LI-RADS ${m[1].toUpperCase()}`],
  [/\bpi-?rads\W{0,3}(?:v?\s?2(?:[.,]1)?\W{0,3})?(?:categoria|cat\.?|score|escore)?\W{0,3}([1-5])\b/gi, (m) => `PI-RADS ${m[1]}`],
  [/\blung-?rads\W{0,3}(?:categoria|cat\.?)?\W{0,3}([0-4](?:[abx]|s)?)\b/gi, (m) => `Lung-RADS ${m[1].toUpperCase()}`],
  [/\bo-?rads\W{0,3}(?:us|rm|mri)?\W{0,3}(?:categoria|cat\.?)?\W{0,3}([0-5])\b/gi, (m) => `O-RADS ${m[1]}`],
  [/\bbosniak\W{0,3}(?:categoria|classe|tipo|cat\.?)?\W{0,3}(iv|i{1,3}\s?f?|[1-4]\s?f?)\b/gi, (m) => {
    let v = m[1].toUpperCase().replace(/\s/g, "");
    v = v.replace(/^[1-4]/, (d) => ROMANO[d]);
    return `Bosniak ${v}`;
  }],
  [/\bfleischner\b/gi, () => "Fleischner"],
];

export function classificacoes(texto) {
  const t = String(texto || "");
  const out = new Set();
  for (const [re, rot] of REGRAS) for (const m of t.matchAll(re)) out.add(rot(m));
  return [...out];
}
