// Preferências que valem em todos os aparelhos (vão para "preferencias.json.gz" no Drive):
//   buscas  : filtros salvos   {nome: {f, em, apagado?}}
//   historico: últimas buscas   {texto: {em}}
//   frases  : frases-modelo     {id: {texto, em, apagado?}}
//   colecoes: nomes de coleções {nome: {em, apagado?}}
// Junta item a item: vale o "em" mais novo; apagar = {apagado: true, em}.
import * as db from "./db.js";

export const CATEGORIAS = ["buscas", "historico", "frases", "colecoes"];
export const vazio = () => Object.fromEntries(CATEGORIAS.map((c) => [c, {}]));

export function juntar(a = {}, b = {}) {
  const out = vazio();
  for (const c of CATEGORIAS) {
    for (const [k, v] of Object.entries(a[c] || {})) out[c][k] = v;
    for (const [k, v] of Object.entries(b[c] || {})) if (!out[c][k] || (v.em || 0) > (out[c][k].em || 0)) out[c][k] = v;
  }
  // histórico: só as 30 mais recentes
  const h = Object.entries(out.historico).sort((x, y) => (y[1].em || 0) - (x[1].em || 0)).slice(0, 30);
  out.historico = Object.fromEntries(h);
  return out;
}
export const iguais = (a, b) => JSON.stringify(juntar(a)) === JSON.stringify(juntar(b));

export async function ler() { return juntar(await db.lerMeta("prefs", vazio())); }
export async function mudar(categoria, chave, valor) {
  const p = await ler();
  p[categoria][chave] = { ...valor, em: Date.now() };
  await db.gravarMeta("prefs", p);
  await db.gravarMeta("prefsSujo", true);
  return p;
}
export const apagar = (categoria, chave) => mudar(categoria, chave, { apagado: true });
export const ativos = (p, categoria) => Object.entries(p[categoria] || {}).filter(([, v]) => !v.apagado);
