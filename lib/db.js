// Banco local do app (IndexedDB deste aparelho): cópia de trabalho do que está no Google Drive.
// "laudos" (chave = acesso; apagados ficam como lápide {apagado: true} para a exclusão chegar aos outros aparelhos),
// "imagens" (blobs em cache, chave "acesso_i"), "meta" (estado da sincronização).
const NOME = "bancoLaudosApp";
let conexao = null;

export function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("laudos", { keyPath: "acc" }).createIndex("data", "data");
      db.createObjectStore("imagens");
      db.createObjectStore("meta");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { conexao = null; falha(r.error); };
  });
  return conexao;
}

// testes: troca de "aparelho" (outro indexedDB)
export function fechar() { conexao?.then((d) => d.close()).catch(() => {}); conexao = null; }

const fim = (tx) => new Promise((ok, falha) => { tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => falha(tx.error); });
const pedido = (r) => new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });

export async function salvar(...regs) {
  const db = await abrir();
  const tx = db.transaction("laudos", "readwrite");
  for (const r of regs.flat()) tx.objectStore("laudos").put(r);
  return fim(tx);
}

export async function atualizar(acc, campos) {
  const db = await abrir();
  const tx = db.transaction("laudos", "readwrite");
  const s = tx.objectStore("laudos");
  const r = s.get(acc);
  r.onsuccess = () => { if (r.result) s.put({ ...r.result, ...campos }); };
  return fim(tx);
}

export async function laudo(acc) {
  const db = await abrir();
  return pedido(db.transaction("laudos").objectStore("laudos").get(acc));
}

// todos os registros, inclusive lápides
export async function todos() {
  const db = await abrir();
  return pedido(db.transaction("laudos").objectStore("laudos").getAll());
}

// do mais novo para o mais antigo, sem as lápides; fn(reg) devolve false para parar
export async function percorrer(fn) {
  const db = await abrir();
  const tx = db.transaction("laudos");
  await new Promise((ok, falha) => {
    const r = tx.objectStore("laudos").index("data").openCursor(null, "prev");
    r.onsuccess = () => {
      const c = r.result;
      if (!c) return ok();
      if (!c.value.apagado && fn(c.value) === false) return ok();
      c.continue();
    };
    r.onerror = () => falha(r.error);
  });
}

export async function imagem(acc, i) {
  const db = await abrir();
  return pedido(db.transaction("imagens").objectStore("imagens").get(`${acc}_${i}`));
}
export async function guardarImagem(acc, i, blob) {
  const db = await abrir();
  const tx = db.transaction("imagens", "readwrite");
  tx.objectStore("imagens").put(blob, `${acc}_${i}`);
  return fim(tx);
}
export async function apagarImagens(acc, n) {
  const db = await abrir();
  const tx = db.transaction("imagens", "readwrite");
  for (let i = 0; i < n; i++) tx.objectStore("imagens").delete(`${acc}_${i}`);
  return fim(tx);
}

export async function lerMeta(chave, padrao = null) {
  const db = await abrir();
  return (await pedido(db.transaction("meta").objectStore("meta").get(chave))) ?? padrao;
}
export async function gravarMeta(chave, valor) {
  const db = await abrir();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(valor, chave);
  return fim(tx);
}
