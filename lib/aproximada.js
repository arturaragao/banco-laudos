// Busca tolerante a erro de digitação: palavra digitada que não existe em nenhum laudo é trocada pela mais parecida
// que existe ("esteatsoe" -> "esteatose"). Sem IA: distância de edição contra o vocabulário dos laudos.
import { normalizar, raiz } from "./filtros.js";

// vocabulário: palavra normalizada (4+ letras) -> quantas vezes aparece
export function vocabulario(textos) {
  const v = new Map();
  for (const t of textos) for (const w of normalizar(t).split(" ")) if (w.length >= 4 && !/^\d+$/.test(w)) v.set(w, (v.get(w) || 0) + 1);
  return v;
}

// Damerau-Levenshtein (transposição conta 1), com limite
export function distancia(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let menor = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      menor = Math.min(menor, d[i][j]);
    }
    if (menor > max) return max + 1;
  }
  return d[a.length][b.length];
}

// expressão de busca -> {expr, trocas: [[digitado, usado]]}. Só mexe em palavras que não acham nada (nem como começo).
export function corrigir(expr, vocab) {
  const palavras = [...vocab.keys()];
  const trocas = [];
  const novo = String(expr || "").replace(/[\p{L}\p{N}]+/gu, (tok) => {
    const n = normalizar(tok);
    if (n.length < 4 || /^\d+$/.test(n)) return tok;
    const r = raiz(n);
    if (palavras.some((w) => w.startsWith(r) || raiz(w).startsWith(r))) return tok;
    const max = n.length <= 6 ? 1 : 2;
    let melhor = null, md = max + 1, mf = 0;
    for (const w of palavras) {
      const dd = Math.min(distancia(n, w, max), distancia(n, w.slice(0, n.length), max));
      const f = vocab.get(w);
      if (dd < md || (dd === md && f > mf)) { melhor = w; md = dd; mf = f; }
    }
    if (!melhor || md > max) return tok;
    trocas.push([tok, melhor]);
    return melhor;
  });
  return { expr: novo, trocas };
}
