// Sincronização do banco local com a nuvem. Não sabe que a nuvem é o Google Drive: recebe um "adaptador" com
//   listar() -> [{nome, id, versao}] · ler(id) -> dados · versao(id) -> versao · gravar(nome, id|null, dados) -> {id, versao}
//   enviarImagem(nome, blob) -> id · baixarImagem(id) -> blob · apagarArquivo(id) · limparRepetidas(usados) (opcional)
// Para trocar de nuvem (ex.: Supabase) basta outro adaptador com essas funções.
// Na nuvem: um arquivo por mês do exame ("laudos-2026-10.json.gz", texto de todos os laudos do mês), uma imagem por arquivo
// e "preferencias.json.gz" (buscas salvas, histórico, frases-modelo, coleções — lib/prefs.js).
// Junta por partes do registro: CONTEÚDO (texto, resumo...: conteudoMudadoEm) e ANOTAÇÕES (favorito, coleções, nota,
// lixeira: anotEm) — vale a parte mais nova de cada lado. Apagado de vez = lápide {acc, data, apagado: true, mudadoEm}.
// No registro local: nuvemEm = mudadoEm da versão que está na nuvem (diferente = falta enviar); imgsLocais = imagens
// guardadas aqui que vieram da extensão; imgs = ids das imagens na nuvem; apagarImgs = imagens a tirar do Drive (lápide).
import * as db from "./db.js";
import * as prefs from "./prefs.js";

export const nomeShard = (r) => `laudos-${/^\d{4}-\d{2}/.test(r.data || "") ? r.data.slice(0, 7) : "sem-data"}.json.gz`;
export const PREFS = "preferencias.json.gz";
const SO_LOCAL = ["nuvemEm", "imgsLocais", "apagarImgs", "__ok", "itensConc", "concPars", "concSet"];
export const ANOTACOES = ["fav", "colecoes", "nota", "lixeiraEm"];
export function limpar(r) {
  const o = { ...r };
  for (const k of SO_LOCAL) delete o[k];
  return o;
}

export async function comprimir(obj) {
  const s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(s).arrayBuffer()], { type: "application/gzip" });
}
export async function descomprimir(blob) {
  const s = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(s).text());
}

export const conteudoDe = (x) => x?.conteudoMudadoEm ?? x?.mudadoEm ?? 0;
// registro local l + o da nuvem r -> {novo, local (algo daqui é mais novo e precisa subir)} ou null (fica o daqui)
export function juntarRegistro(l, r) {
  if (!l) return { novo: { ...r }, local: false };
  if (r.apagado || l.apagado) return (r.mudadoEm || 0) > (l.mudadoEm || 0) ? { novo: { ...r, apagarImgs: l.apagarImgs }, local: false } : null;
  const cR = conteudoDe(r) > conteudoDe(l), cL = conteudoDe(l) > conteudoDe(r);
  const aR = (r.anotEm || 0) > (l.anotEm || 0), aL = (l.anotEm || 0) > (r.anotEm || 0);
  const imgsL = (l.imgs?.length || 0) > (r.imgs?.length || 0);
  if (!cR && !aR) return null;
  const base = cR ? r : l, anot = aR ? r : l;
  const novo = { ...base, mudadoEm: Math.max(r.mudadoEm || 0, l.mudadoEm || 0), anotEm: anot.anotEm || 0 };
  for (const k of ANOTACOES) { if (k in anot) novo[k] = anot[k]; else delete novo[k]; }
  novo.imgs = imgsL ? l.imgs : r.imgs;
  return { novo, local: cL || aL || imgsL };
}

// registros vindos da nuvem -> banco local; devolve quantos mudaram aqui
async function mesclar(regs) {
  let n = 0;
  for (const r of regs || []) {
    const l = await db.laudo(r.acc);
    const j = juntarRegistro(l, r);
    if (!j) { if (l && !l.apagado && !r.apagado && (conteudoDe(l) > conteudoDe(r) || (l.anotEm || 0) > (r.anotEm || 0))) await db.atualizar(r.acc, { nuvemEm: -1 }); continue; }
    const novo = { ...j.novo, imgsLocais: l?.imgsLocais || 0, nuvemEm: j.local ? -1 : j.novo.mudadoEm };
    if (r.apagado && l && !l.apagado) await db.apagarImagens(r.acc, Math.max(l.nImagens || 0, l.imgsLocais || 0));
    await db.salvar(novo);
    n++;
  }
  return n;
}

let rodando = null;
export function sincronizar(nv, aviso = () => {}) {
  rodando ||= rodar(nv, aviso).finally(() => { rodando = null; });
  return rodando;
}

async function rodar(nv, aviso) {
  const meta = await db.lerMeta("nuvem", { shards: {} });
  let recebidos = 0, enviados = 0, imagens = 0;

  // 1. traz o que mudou lá
  aviso("Conferindo a nuvem...");
  const todosRemotos = await nv.listar();
  const remotos = todosRemotos.filter((s) => s.nome !== PREFS);
  for (const s of remotos) {
    if (meta.shards[s.nome]?.versao === s.versao) continue;
    aviso(`Baixando ${s.nome}...`);
    recebidos += await mesclar(await nv.ler(s.id));
    meta.shards[s.nome] = { id: s.id, versao: s.versao };
    await db.gravarMeta("nuvem", meta);
  }
  for (const s of remotos) if (!meta.shards[s.nome]) meta.shards[s.nome] = { id: s.id, versao: s.versao };

  // 1b. preferências (buscas salvas, histórico, frases, coleções)
  const pr = todosRemotos.find((s) => s.nome === PREFS);
  const sujo = await db.lerMeta("prefsSujo", false);
  if (sujo || (pr && meta.prefs?.versao !== pr.versao)) {
    const local = await prefs.ler();
    const remoto = pr ? await nv.ler(pr.id) : prefs.vazio();
    const junto = prefs.juntar(local, remoto);
    await db.gravarMeta("prefs", junto);
    if (!pr || !prefs.iguais(junto, remoto)) meta.prefs = await nv.gravar(PREFS, pr?.id || null, junto);
    else meta.prefs = { id: pr.id, versao: pr.versao };
    await db.gravarMeta("prefsSujo", false);
    await db.gravarMeta("nuvem", meta);
  }

  // 2. envia o texto que mudou aqui (o mês inteiro, num arquivo só) — antes das imagens, que demoram
  async function enviarMeses(quieto) {
    let regs = await db.todos();
    const sujos = new Set(regs.filter((r) => r.nuvemEm !== r.mudadoEm).map(nomeShard));
    for (const nome of sujos) {
      const s = meta.shards[nome];
      if (s) {
        // alguém mexeu nesse mês depois que eu li: junta antes de gravar por cima
        const v = await nv.versao(s.id);
        if (v !== s.versao) { recebidos += await mesclar(await nv.ler(s.id)); s.versao = v; regs = await db.todos(); }
      }
      const doMes = regs.filter((r) => nomeShard(r) === nome);
      if (!quieto) aviso(`Enviando ${nome} (${doMes.length} laudos)...`);
      meta.shards[nome] = await nv.gravar(nome, s?.id || null, doMes.map(limpar));
      await db.gravarMeta("nuvem", meta);
      for (const r of doMes) if (r.nuvemEm !== r.mudadoEm) { if (r.nuvemEm !== -1) enviados++; await db.atualizar(r.acc, { nuvemEm: r.mudadoEm }); }
    }
  }
  await enviarMeses();

  // 3. imagens que vieram da extensão neste PC e ainda não estão na nuvem: 4 laudos ao mesmo tempo; a cada lote,
  // os meses mexidos vão de novo para a nuvem com os ids das imagens (se parar no meio, o que foi enviado já vale)
  const comImg = (await db.todos()).filter((r) => !r.apagado && (r.imgsLocais || 0) > (r.imgs?.length || 0));
  const falta = comImg.reduce((s, r) => s + r.imgsLocais - (r.imgs?.length || 0), 0);
  const umLaudo = async (r) => {
    const imgs = [...(r.imgs || [])];
    for (let i = imgs.length; i < r.imgsLocais; i++) {
      const b = await db.imagem(r.acc, i);
      if (!b) break;
      imgs.push(await nv.enviarImagem(`${r.acc}_${i}.${/png/.test(b.type) ? "png" : /jpe?g/.test(b.type) ? "jpg" : "webp"}`, b));
      await db.atualizar(r.acc, { imgs: [...imgs], nuvemEm: -1 });
      aviso(`Enviando imagens: ${++imagens} de ${falta}...`);
    }
  };
  for (let k = 0; k < comImg.length; k += 20) {
    const lote = comImg.slice(k, k + 20);
    for (let j = 0; j < lote.length; j += 4) await Promise.all(lote.slice(j, j + 4).map(umLaudo));
    await enviarMeses(true);
  }
  // 4. imagens de laudos apagados de vez (lixeira com mais de 30 dias): saem do Drive, se nenhum outro laudo usa
  const lapides = (await db.todos()).filter((r) => r.apagado && r.apagarImgs?.length);
  if (lapides.length && nv.apagarArquivo) {
    const usados = new Set((await db.todos()).filter((r) => !r.apagado).flatMap((r) => r.imgs || []));
    for (const r of lapides) {
      for (const id of r.apagarImgs) if (!usados.has(id)) await nv.apagarArquivo(id).catch(() => {});
      await db.atualizar(r.acc, { apagarImgs: [] });
    }
  }

  // cópias repetidas de imagens no Drive (1ª tentativa de envio, em 16/10): apaga uma vez, só no PC que envia as imagens
  // (é ele que sabe todos os ids usados), e só depois de enviar tudo
  const todosAqui = await db.todos();
  if (nv.limparRepetidas && !meta.limpezaImagens && !comImg.length && todosAqui.some((r) => r.imgsLocais)) {
    aviso("Procurando imagens repetidas no Drive...");
    const usados = new Set(todosAqui.flatMap((r) => r.imgs || []));
    const n = await nv.limparRepetidas(usados);
    if (n) aviso(`${n} imagem(ns) repetida(s) apagada(s) do Drive`);
    meta.limpezaImagens = Date.now();
  }
  meta.ultima = Date.now();
  await db.gravarMeta("nuvem", meta);
  return { recebidos, enviados, imagens };
}

// imagem i de um laudo: do cache deste aparelho ou baixada da nuvem (e guardada)
export async function imagemDe(nv, r, i) {
  const b = await db.imagem(r.acc, i);
  if (b) return b;
  const id = r.imgs?.[i];
  if (!id || !nv) return null;
  const nova = await nv.baixarImagem(id);
  await db.guardarImagem(r.acc, i, nova);
  return nova;
}
