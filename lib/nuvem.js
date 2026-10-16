// Sincronização do banco local com a nuvem. Não sabe que a nuvem é o Google Drive: recebe um "adaptador" com
//   listar() -> [{nome, id, versao}] · ler(id) -> [registros] · versao(id) -> versao · gravar(nome, id|null, [registros]) -> {id, versao}
//   enviarImagem(nome, blob) -> id · baixarImagem(id) -> blob
// Para trocar de nuvem (ex.: Supabase) basta outro adaptador com essas funções.
// Na nuvem: um arquivo por mês do exame ("laudos-2026-10.json.gz", texto de todos os laudos do mês) + uma imagem por arquivo.
// Vale a versão com o mudadoEm mais novo; apagado = lápide {acc, data, apagado: true, mudadoEm}.
// No registro local: nuvemEm = mudadoEm da última versão que está na nuvem (diferente = falta enviar);
// imgsLocais = imagens guardadas aqui que vieram da extensão; imgs = ids das imagens na nuvem.
import * as db from "./db.js";

export const nomeShard = (r) => `laudos-${/^\d{4}-\d{2}/.test(r.data || "") ? r.data.slice(0, 7) : "sem-data"}.json.gz`;
const SO_LOCAL = ["nuvemEm", "imgsLocais", "__ok", "itensConc", "concPars", "concSet"];
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

// registros vindos da nuvem -> banco local (só os mais novos que os daqui); devolve quantos entraram
async function mesclar(regs) {
  let n = 0;
  for (const r of regs || []) {
    const l = await db.laudo(r.acc);
    if (l && (r.mudadoEm || 0) <= (l.mudadoEm || 0)) continue;
    const novo = { ...r, nuvemEm: r.mudadoEm, imgsLocais: l?.imgsLocais || 0 };
    // imagens enviadas daqui que ainda não estavam lá: ficam, e o registro volta para a fila de envio
    if ((l?.imgs?.length || 0) > (r.imgs?.length || 0)) { novo.imgs = l.imgs; novo.nuvemEm = -1; }
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
  const remotos = await nv.listar();
  for (const s of remotos) {
    if (meta.shards[s.nome]?.versao === s.versao) continue;
    aviso(`Baixando ${s.nome}...`);
    recebidos += await mesclar(await nv.ler(s.id));
    meta.shards[s.nome] = { id: s.id, versao: s.versao };
    await db.gravarMeta("nuvem", meta);
  }
  for (const s of remotos) if (!meta.shards[s.nome]) meta.shards[s.nome] = { id: s.id, versao: s.versao };

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
