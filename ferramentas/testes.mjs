// Testes da sincronização (sem navegador): Drive falso em memória, extensão falsa, dois "aparelhos" (PC e celular).
// Uso: npm i && node ferramentas/testes.mjs
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";

globalThis.indexedDB = new IDBFactory();
const db = await import("../lib/db.js");
const { sincronizar, imagemDe, comprimir, descomprimir } = await import("../lib/nuvem.js");
const { comExtensao } = await import("../lib/ponte.js");
const { camposDaEdicao, recalculo, RESUMO_VERSAO } = await import("../lib/regras.js");

let ok = 0;
const teste = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };

// ---------- Drive falso ----------
const drive = { arquivos: new Map(), seq: 0 };
const nv = {
  async listar() { return [...drive.arquivos].filter(([, f]) => !f.imagem).map(([id, f]) => ({ nome: f.nome, id, versao: String(f.versao) })); },
  async ler(id) { return descomprimir(drive.arquivos.get(id).blob); },
  async versao(id) { return String(drive.arquivos.get(id).versao); },
  async gravar(nome, id, regs) {
    const blob = await comprimir(regs);
    if (!id) { id = "f" + ++drive.seq; drive.arquivos.set(id, { nome, versao: 0 }); }
    const f = drive.arquivos.get(id);
    f.blob = blob; f.versao++;
    return { id, versao: String(f.versao) };
  },
  async enviarImagem(nome, blob) { const id = "i" + ++drive.seq; drive.arquivos.set(id, { nome, imagem: true, blob }); return id; },
  async baixarImagem(id) { return drive.arquivos.get(id).blob; },
};

// ---------- extensão falsa (mesma regra do background.js: ponte()) ----------
const ext = { laudos: new Map(), apagados: new Set(), imagens: new Map() };
const conteudoEm = (r) => Math.max(r.salvoEm || 0, r.conteudoEditadoEm || 0, r.resumoManualEm || 0);
const dataUrl = (s) => "data:image/webp;base64," + Buffer.from(s).toString("base64");
async function pedirExt(m) {
  if (m.op === "listar") return { ok: true, laudos: [...ext.laudos.values()].map((r) => ({ acc: r.acc, em: conteudoEm(r), n: r.nImagens || 0 })), apagados: [...ext.apagados] };
  if (m.op === "laudos") return { ok: true, laudos: m.accs.map((a) => ext.laudos.get(a)).filter(Boolean).map((r) => ({ ...r, mudadoEm: conteudoEm(r) })) };
  if (m.op === "imagens") return { ok: true, imagens: (ext.imagens.get(m.acc) || []).map(dataUrl) };
  if (m.op === "gravar") {
    const em = {};
    for (const x of m.laudos) {
      const r = ext.laudos.get(x.acc);
      if (!r || conteudoEm(r) >= x.mudadoEm) continue;
      const agora = Date.now();
      Object.assign(r, x.campos, { editadoEm: agora, conteudoEditadoEm: agora });
      em[x.acc] = conteudoEm(r);
    }
    return { ok: true, em };
  }
  if (m.op === "apagar") {
    for (const acc of m.accs) { const r = ext.laudos.get(acc); if (r && conteudoEm(r) > (m.em[acc] || 0)) continue; ext.laudos.delete(acc); ext.apagados.add(acc); }
    return { ok: true };
  }
}
const pars = (conc) => [[{ t: "TC DE TÓRAX", b: true, i: false, u: false }], [{ t: "Indicação: tosse.", b: false, i: false, u: false }],
  [{ t: "Conclusão:", b: true, i: false, u: false }], ...conc.map((c, i) => [{ t: `${i + 1}. ${c}`, b: false, i: false, u: false }])];
const novoExt = (acc, data, conc, nImg = 0) => {
  ext.laudos.set(acc, { acc, data, titulo: "TC DE TÓRAX", medico: "Dr. Teste", pars: pars(conc), texto: conc.join("\n"), nImagens: nImg, salvoEm: Date.now() - 1000, editadoEm: Date.now() - 1000, resumo: conc[0] });
  if (nImg) ext.imagens.set(acc, Array.from({ length: nImg }, (_, i) => `img-${acc}-${i}`));
};
const espera = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// aparelhos
const PC = new IDBFactory(), CEL = new IDBFactory();
const no = (f) => { db.fechar(); globalThis.indexedDB = f; };

novoExt("A1", "2026-10-01", ["Nódulo pulmonar sólido no lobo superior direito."], 2);
novoExt("A2", "2026-10-05", ["Enfisema centrolobular."]);
novoExt("A3", "2026-09-20", ["Derrame pleural."]);

await teste("PC: traz os laudos e as imagens da extensão", async () => {
  no(PC);
  const r = await comExtensao(pedirExt);
  assert.equal(r.trazidos, 3);
  assert.equal(r.imagens, 2);
  const a1 = await db.laudo("A1");
  assert.equal(a1.imgsLocais, 2);
  assert.equal(await (await db.imagem("A1", 1)).text(), "img-A1-1");
});

await teste("PC: envia ao Drive (um arquivo por mês + imagens)", async () => {
  const r = await sincronizar(nv);
  assert.equal(r.enviados, 3);
  assert.equal(r.imagens, 2);
  const nomes = (await nv.listar()).map((s) => s.nome).sort();
  assert.deepEqual(nomes, ["laudos-2026-09.json.gz", "laudos-2026-10.json.gz"]);
  for (const x of await db.todos()) assert.equal(x.nuvemEm, x.mudadoEm);
  const r2 = await sincronizar(nv);
  assert.deepEqual(r2, { recebidos: 0, enviados: 0, imagens: 0 });
  const doMes = await nv.ler((await nv.listar()).find((s) => s.nome.includes("10")).id);
  assert.ok(!("nuvemEm" in doMes[0]) && !("imgsLocais" in doMes[0]), "campos só locais não vão para a nuvem");
});

await teste("PC: segunda conversa com a extensão não traz nada de novo", async () => {
  const r = await comExtensao(pedirExt);
  assert.equal(r.trazidos + r.levados + r.imagens, 0);
});

await teste("Celular: recebe tudo e baixa a imagem do Drive ao abrir", async () => {
  no(CEL);
  const r = await sincronizar(nv);
  assert.equal(r.recebidos, 3);
  const a1 = await db.laudo("A1");
  assert.equal(a1.imgs.length, 2);
  assert.equal(await (await imagemDe(nv, a1, 0)).text(), "img-A1-0");
  assert.ok(await db.imagem("A1", 0), "fica guardada no celular");
});

await teste("Celular edita; PC recebe e leva à extensão", async () => {
  await espera();
  const a2 = await db.laudo("A2");
  const novos = pars(["Enfisema centrolobular e parasseptal."]);
  await db.atualizar("A2", camposDaEdicao(a2, novos, ""));
  await sincronizar(nv);
  no(PC);
  const r = await sincronizar(nv);
  assert.equal(r.recebidos, 1);
  assert.match((await db.laudo("A2")).texto, /parasseptal/);
  const x = await comExtensao(pedirExt);
  assert.equal(x.levados, 1);
  assert.match(ext.laudos.get("A2").pars.flat().map((s) => s.t).join(" "), /parasseptal/);
  assert.equal((await db.laudo("A2")).conteudoMudadoEm, conteudoEm(ext.laudos.get("A2")));
  const y = await comExtensao(pedirExt);
  assert.equal(y.trazidos + y.levados, 0, "não fica indo e voltando");
});

await teste("Sincronização da extensão com o Notion (só editadoEm) não vira edição", async () => {
  ext.laudos.get("A1").editadoEm = Date.now() + 99999;
  const r = await comExtensao(pedirExt);
  assert.equal(r.trazidos, 0);
});

await teste("Edição na extensão chega ao celular", async () => {
  await espera();
  const a3 = ext.laudos.get("A3");
  Object.assign(a3, { pars: pars(["Derrame pleural volumoso."]), texto: "Derrame pleural volumoso.", conteudoEditadoEm: Date.now() });
  assert.equal((await comExtensao(pedirExt)).trazidos, 1);
  await sincronizar(nv);
  no(CEL);
  await sincronizar(nv);
  assert.match((await db.laudo("A3")).texto, /volumoso/);
});

await teste("Celular apaga; some do PC e da extensão", async () => {
  await espera();
  await db.salvar({ acc: "A3", data: "2026-09-20", apagado: true, mudadoEm: Date.now(), nuvemEm: (await db.laudo("A3")).nuvemEm });
  await sincronizar(nv);
  no(PC);
  await sincronizar(nv);
  assert.ok((await db.laudo("A3")).apagado);
  const r = await comExtensao(pedirExt);
  assert.equal(r.apagadosLa, 1);
  assert.ok(!ext.laudos.has("A3") && ext.apagados.has("A3"));
  assert.equal((await comExtensao(pedirExt)).trazidos, 0, "não volta da extensão");
});

await teste("Apagado na extensão some do app e do celular", async () => {
  await espera();
  ext.laudos.delete("A2"); ext.apagados.add("A2");
  assert.equal((await comExtensao(pedirExt)).apagadosAqui, 1);
  await sincronizar(nv);
  no(CEL);
  await sincronizar(nv);
  assert.ok((await db.laudo("A2")).apagado);
  let n = 0; await db.percorrer(() => { n++; });
  assert.equal(n, 1, "só sobra o A1 na busca");
});

await teste("Laudo novo copiado do portal entra no PC e chega ao celular", async () => {
  no(PC);
  novoExt("B1", "2026-10-10", ["Esteatose hepática."], 1);
  assert.equal((await comExtensao(pedirExt)).trazidos, 1);
  const r = await sincronizar(nv);
  assert.equal(r.imagens, 1);
  no(CEL);
  await sincronizar(nv);
  const b1 = await db.laudo("B1");
  assert.equal(b1.imgs.length, 1);
  assert.equal(await (await imagemDe(nv, b1, 0)).text(), "img-B1-0");
});

await teste("Edições ao mesmo tempo no mesmo mês, em aparelhos diferentes: as duas ficam", async () => {
  await espera();
  no(CEL);
  const a1 = await db.laudo("A1");
  await db.atualizar("A1", camposDaEdicao(a1, pars(["Nódulo pulmonar sólido — editado no celular."]), ""));
  no(PC);
  const b1 = await db.laudo("B1");
  await db.atualizar("B1", camposDaEdicao(b1, pars(["Esteatose hepática — editado no PC."]), ""));
  await sincronizar(nv);            // PC grava o mês 10 primeiro
  no(CEL);
  await sincronizar(nv);            // celular percebe que o mês mudou, junta e grava
  assert.match((await db.laudo("B1")).texto, /no PC/);
  no(PC);
  await sincronizar(nv);
  assert.match((await db.laudo("A1")).texto, /no celular/);
  assert.match((await db.laudo("B1")).texto, /no PC/);
});

await teste("Parou no meio das imagens: o texto já está na nuvem e depois continua de onde parou", async () => {
  no(PC);
  novoExt("C1", "2026-08-02", ["Cisto renal simples."], 6);
  await comExtensao(pedirExt);
  const enviar = nv.enviarImagem;
  let n = 0;
  nv.enviarImagem = async (...a) => { if (++n > 3) throw new Error("caiu a internet"); return enviar(...a); };
  await assert.rejects(sincronizar(nv));
  nv.enviarImagem = enviar;
  assert.ok((await nv.listar()).some((s) => s.nome === "laudos-2026-08.json.gz"), "texto enviado antes das imagens");
  assert.equal((await db.laudo("C1")).imgs.length, 3);
  const r = await sincronizar(nv);
  assert.equal(r.imagens, 3);
  no(CEL);
  await sincronizar(nv);
  assert.equal((await db.laudo("C1")).imgs.length, 6);
});

await teste("Imagens repetidas no Drive: apaga as cópias, nunca uma imagem usada", async () => {
  const { escolherRepetidas, hashDe } = await import("../lib/drive.js");
  const arqs = [
    { id: "a", name: "X_0.jpg" }, { id: "b", name: "X_0.jpg" },                           // mesmo nome, nenhuma usada: fica a mais antiga
    { id: "c", name: "Y_0.jpg" }, { id: "d", name: "Y_0.jpg" }, { id: "e", name: "Y_0.jpg" }, // a usada fica
    { id: "f", name: "Z_0.jpg", appProperties: { hash: "h1" } }, { id: "g", name: "W_3.jpg", appProperties: { hash: "h1" } }, // mesmo conteúdo
    { id: "h", name: "Q_0.jpg" },                                                           // única
  ];
  assert.deepEqual(escolherRepetidas(arqs, new Set(["d", "g"])).sort(), ["b", "c", "e", "f"]);
  assert.equal(await hashDe(new Blob(["abc"])), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

await teste("Favorito no celular + edição no PC no mesmo laudo: as duas coisas ficam", async () => {
  await espera();
  nv.apagarArquivo = async (id) => { drive.arquivos.delete(id); };
  no(CEL);
  const agora = Date.now();
  await db.atualizar("A1", { fav: true, nota: "caso bom", colecoes: ["ensino"], anotEm: agora, mudadoEm: agora });
  no(PC);
  await espera();
  const a1 = await db.laudo("A1");
  await db.atualizar("A1", camposDaEdicao(a1, pars(["Nódulo — revisado no PC."]), ""));
  await sincronizar(nv);
  no(CEL);
  await sincronizar(nv);
  no(PC);
  await sincronizar(nv);
  for (const ap of [PC, CEL]) {
    no(ap);
    const r = await db.laudo("A1");
    assert.ok(r.fav && r.nota === "caso bom" && r.colecoes[0] === "ensino", "anotações");
    assert.match(r.texto, /revisado no PC/, "conteúdo");
  }
  const x = await comExtensao(pedirExt);
  assert.equal(x.trazidos, 0);
  no(PC);
  assert.ok((await db.laudo("A1")).fav, "favorito não some quando a extensão manda o laudo");
});

await teste("Preferências (buscas salvas, frases) chegam ao outro aparelho", async () => {
  const prefs = await import("../lib/prefs.js");
  no(PC);
  await prefs.mudar("buscas", "Nódulos", { f: { q: "nodulo pulmonar" } });
  await prefs.mudar("frases", "f1", { texto: "Sem alterações significativas." });
  await sincronizar(nv);
  no(CEL);
  await prefs.mudar("frases", "f2", { texto: "Controle evolutivo." });
  await sincronizar(nv);
  no(PC);
  await sincronizar(nv);
  const p = await prefs.ler();
  assert.equal(p.buscas["Nódulos"].f.q, "nodulo pulmonar");
  assert.deepEqual(prefs.ativos(p, "frases").map(([k]) => k).sort(), ["f1", "f2"]);
});

await teste("Lixeira vencida: vira lápide e as imagens saem do Drive", async () => {
  no(PC);
  const b1 = await db.laudo("B1");
  const ids = [...b1.imgs];
  assert.ok(ids.every((id) => drive.arquivos.has(id)));
  await db.salvar({ acc: "B1", data: b1.data, apagado: true, mudadoEm: Date.now(), nuvemEm: b1.nuvemEm, apagarImgs: ids });
  await sincronizar(nv);
  assert.ok(ids.every((id) => !drive.arquivos.has(id)), "imagens apagadas do Drive");
  assert.equal((await comExtensao(pedirExt)).apagadosLa, 1);
});

await teste("Classificações, busca aproximada e facetas", async () => {
  const { classificacoes } = await import("../lib/classificacoes.js");
  assert.deepEqual(classificacoes("Lesão PI-RADS v2.1 categoria 4. Cisto Bosniak 2F. ACR TI-RADS TR3. Lung-RADS 4A; ver Fleischner. BI-RADS: 0"),
    ["BI-RADS 0", "TI-RADS 3", "PI-RADS 4", "Lung-RADS 4A", "Bosniak IIF", "Fleischner"]);
  const { vocabulario, corrigir } = await import("../lib/aproximada.js");
  const v = vocabulario(["Esteatose hepática difusa.", "Nódulo pulmonar sólido."]);
  assert.deepEqual(corrigir("esteatsoe -leve", v), { expr: "esteatose -leve", trocas: [["esteatsoe", "esteatose"]] });
  assert.equal(corrigir("nodul pulm", v).trocas.length, 0, "começo de palavra não é erro");
  const { indexar, filtrar } = await import("../lib/indice.js");
  const ixs = [
    { acc: "11111", data: "2026-10-01", mod: "CT", titulo: "TC DE TÓRAX", medico: "A", texto: "Nódulo pulmonar.", etiquetas: ["nódulo pulmonar"], pars: [] },
    { acc: "22222", data: "2026-10-02", mod: "CT", titulo: "TC DE ABDOME", medico: "B", texto: "Esteatose.", etiquetas: ["esteatose"], pars: [] },
    { acc: "33333", data: "2026-10-03", mod: "MR", titulo: "RM DO JOELHO", medico: "A", texto: "Normal.", pars: [] },
  ].map(indexar);
  const r = filtrar(ixs, { facetas: { mod: ["TC"] } }, "");
  assert.deepEqual(r.lista.map((x) => x.r.acc), ["11111", "22222"]);
  assert.deepEqual(r.contagens.mod, [["TC", 2], ["RM", 1]], "contagem do grupo ignora o próprio filtro");
  assert.deepEqual(r.contagens.medico, [["A", 1], ["B", 1]]);
  assert.equal(filtrar(ixs, {}, "22222").lista.length, 1, "número de acesso");
});

await teste("Resumo: refaz nos registros antigos sem marcar como edição", async () => {
  no(PC); const b1 = await db.laudo("A1");
  const c = recalculo({ ...b1, resumoVersao: 0 });
  assert.equal(c.resumoVersao, RESUMO_VERSAO);
  assert.ok(!("mudadoEm" in c));
  assert.equal(recalculo(b1), null);
});

console.log(`\n${ok} testes passaram`);
