// Destaque da conclusão aprendido com os negritos que o Artur muda à mão (pedido de 16/10/2026), sem IA:
//   • laudo "feito à mão" = destaqueManual (editado na conclusão no app ou na extensão) ou editado no Notion com o negrito
//     da conclusão diferente do automático da extensão (destacarConclusao);
//   • nesses laudos, compara palavra por palavra o negrito dele com o automático do app (lib/destaque.js):
//       sempre = trechos que ele destacou e o app não (ex.: "manguito rotador", "pequena rotura");
//       nunca  = palavras que o app destacava e ele tirou (ex.: "parcial"), se ele tirou mais vezes do que destacou;
//   • as listas valem para todos os outros laudos (definirAprendizado) e os feitos à mão ficam como ele deixou.
import { textoDoParagrafo } from "./laudo2notion.js";
import { dividirLaudo, destacarConclusao } from "./secoes.js";
import { analisarItem, espelho, SEM_APRENDIZADO } from "./destaque.js";

const semMarca = (p) => p.map((s) => ({ ...s, b: false, u: false }));
// negrito só nas letras e números (espaço destacado ou não, tanto faz)
function mascara(p) {
  let s = "";
  for (const x of p) for (const c of String(x.t)) if (/[\p{L}\p{N}]/u.test(c)) s += x.b ? "1" : "0";
  return s;
}
const conclusaoDe = (r) => (r.pars?.length ? dividirLaudo(r.pars).secoes.conclusao || [] : []);

export function feitoAMao(r) {
  if (r.destaqueManual) return true;
  if (!r.conteudoEditadoEm) return false;            // nunca editado: o negrito é o automático (ou o antigo do AHK)
  return conclusaoDe(r).some((p) => mascara(p) !== mascara(destacarConclusao(semMarca(p))));
}

const LIGA = new Set(["de", "do", "da", "dos", "das", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "com", "ao", "por", "para"]);

// registros -> {sempre: [frases], nunca: [palavras], laudos: n}
export function aprender(regs) {
  const votos = new Map();          // palavra -> [destacou, tirou]
  const frases = new Map();         // frase -> vezes
  let laudos = 0;
  const voto = (w, k) => { const v = votos.get(w) || [0, 0]; v[k]++; votos.set(w, v); };
  for (const r of regs) {
    if (!r || r.apagado || !feitoAMao(r)) continue;
    laudos++;
    for (const p of conclusaoDe(r)) {
      const texto = textoDoParagrafo(p);
      const m = espelho(texto);
      const mao = new Uint8Array(m.length);
      let pos = 0;
      for (const s of p) { const n = String(s.t).length; if (s.b) mao.fill(1, pos, pos + n); pos += n; }
      const auto = new Uint8Array(m.length);
      for (const [a, b] of analisarItem(texto, SEM_APRENDIZADO).faixas) auto.fill(1, a, b);
      const toks = [...m.matchAll(/[a-z0-9][a-z0-9\-]*/g)].map((x) => {
        const a = x.index, b = a + x[0].length;
        let nm = 0, na = 0;
        for (let i = a; i < b; i++) { nm += mao[i]; na += auto[i]; }
        return { w: x[0], a, b, mao: nm * 2 > b - a, auto: na * 2 > b - a };
      });
      // trechos seguidos que ele destacou (sem pontuação no meio)
      for (let i = 0; i < toks.length;) {
        if (!toks[i].mao) { i++; continue; }
        let j = i;
        while (j + 1 < toks.length && toks[j + 1].mao && !/[^\s]/.test(m.slice(toks[j].b, toks[j + 1].a))) j++;
        let run = toks.slice(i, j + 1);
        while (run.length && (LIGA.has(run[0].w) || /^\d+$/.test(run[0].w))) run = run.slice(1);   // sem o número do item
        while (run.length && LIGA.has(run[run.length - 1].w)) run = run.slice(0, -1);
        if (run.length && run.some((t) => !t.auto)) { const fr = run.map((t) => t.w).join(" "); frases.set(fr, (frases.get(fr) || 0) + 1); }
        i = j + 1;
      }
      for (const t of toks) {
        if (t.w.length < 3 || LIGA.has(t.w) || /^\d/.test(t.w)) continue;
        if (t.mao) voto(t.w, 0); else if (t.auto) voto(t.w, 1);
      }
    }
  }
  const nunca = [...votos].filter(([, [sim, nao]]) => nao > sim).map(([w]) => w).sort();
  // frase mais longa primeiro
  const sempre = [...frases.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return { sempre, nunca, laudos };
}
