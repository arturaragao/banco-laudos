// Regras de edição e de resumo — as mesmas do background.js da extensão Copiar Laudos Vue (salvarEdicao, recalcularResumos,
// derivados). filtros.js, secoes.js e laudo2notion.js são cópias exatas das da extensão: ao mudar lá, copiar para cá.
import { textoDoParagrafo, abreviarTitulo, separarLinhas } from "./laudo2notion.js";
import { etiquetas } from "./filtros.js";
import { dividirLaudo, laudoNormal, resumoLaudo, conclusaoNumerada, RESUMO_VERSAO } from "./secoes.js";

export { RESUMO_VERSAO };
export const textoSecao = (div, ...chaves) => chaves.flatMap((c) => div.secoes[c] || []).map(textoDoParagrafo).join("\n");
export const parsDoCorpo = (div) => div.ordem.flatMap((s) => s.pars);
const SECOES_ACHADOS = ["achados", "comparacao", "comentarios"];
export const etiquetasDe = (div) => etiquetas(textoSecao(div, ...SECOES_ACHADOS, "conclusao"));

// campos que saem do texto do laudo
export function derivados(div) {
  return {
    texto: parsDoCorpo(div).map(textoDoParagrafo).join("\n"), normal: laudoNormal(div), etiquetas: etiquetasDe(div),
    indicacao: textoSecao(div, "indicacao").replace(/\s*\n\s*/g, " ").trim(), conclusao: conclusaoNumerada(div),
  };
}

// laudo editado: campos novos do registro (mudadoEm = momento da mudança, é o que vale na sincronização)
export function camposDaEdicao(r, pars, resumoDigitado, destaqueManual = true, agora = Date.now()) {
  const div = dividirLaudo(pars);
  const auto = resumoLaudo(div);
  const dig = String(resumoDigitado ?? "").trim();
  // resumo: digitado diferente do atual = escrito à mão; apagado = volta ao automático
  const manual = dig ? (dig !== (r.resumo || "") || !!r.resumoManual) : false;
  return {
    pars, ...derivados(div), resumo: manual ? dig : auto, resumoManual: manual, resumoManualEm: manual ? agora : 0, resumoVersao: RESUMO_VERSAO,
    destaqueManual: destaqueManual || !!r.destaqueManual, mudadoEm: agora, conteudoMudadoEm: agora,
  };
}

// regras do resumo mudaram (RESUMO_VERSAO): campos a trocar no registro, ou null se nada muda.
// Não mexe no mudadoEm: todos os aparelhos refazem igual, não precisa viajar pela nuvem.
export function recalculo(r, forcar = false) {
  if (!r.pars?.length || (!forcar && (r.resumoVersao || 0) >= RESUMO_VERSAO)) return null;
  const c = { resumoVersao: RESUMO_VERSAO };
  let pars = r.pars;
  const sep = separarLinhas(pars);
  if (JSON.stringify(sep) !== JSON.stringify(pars)) { pars = sep; Object.assign(c, { pars }, derivados(dividirLaudo(pars))); }
  let manual = r.resumoManual;
  if (manual && !r.resumoManualEm) { manual = false; c.resumoManual = false; }
  const div = dividirLaudo(pars);
  c.etiquetas = etiquetasDe(div);
  if (!manual) Object.assign(c, { resumo: resumoLaudo(div), conclusao: conclusaoNumerada(div) || r.conclusao || "", titulo: abreviarTitulo(r.titulo) });
  return c;
}
