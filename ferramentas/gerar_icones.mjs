// Gera icons/icon-192.png e icon-512.png (sem dependências): fundo verde, folha branca com linhas e uma lupa.
// Uso: node ferramentas/gerar_icones.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function bloco(tipo, dados) {
  const t = Buffer.from(tipo), tam = Buffer.alloc(4), crc = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
function png(n, cor) {
  const SS = 4, linhas = [];
  for (let y = 0; y < n; y++) {
    const l = Buffer.alloc(1 + n * 3);
    for (let x = 0; x < n; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = cor((x + (sx + 0.5) / SS) / n, (y + (sy + 0.5) / SS) / n);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      for (let k = 0; k < 3; k++) l[1 + x * 3 + k] = Math.round(acc[k] / SS / SS);
    }
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(Buffer.concat(linhas))), bloco("IEND", Buffer.alloc(0))]);
}
const VERDE = [15, 92, 77], BRANCO = [245, 250, 248], LINHA = [150, 190, 180], LUPA = [255, 196, 70];
function cor(x, y) {
  // lupa (anel + cabo), por cima da folha
  const dx = x - 0.62, dy = y - 0.62, r = Math.hypot(dx, dy);
  if (r > 0.105 && r < 0.15) return LUPA;
  const t = ((x - 0.72) + (y - 0.72)) / 2, d = Math.abs((x - 0.72) - (y - 0.72)) / Math.SQRT2;
  if (t > 0 && t < 0.13 && d < 0.032) return LUPA;
  // folha
  if (x > 0.27 && x < 0.69 && y > 0.2 && y < 0.8) {
    for (const ly of [0.32, 0.42, 0.52]) if (Math.abs(y - ly) < 0.022 && x > 0.33 && x < 0.63) return LINHA;
    return BRANCO;
  }
  return VERDE;
}
const pasta = fileURLToPath(new URL("../icons/", import.meta.url));
for (const n of [192, 512]) writeFileSync(pasta + `icon-${n}.png`, png(n, cor));
console.log("ícones gerados");
