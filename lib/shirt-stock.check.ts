// Teste read-only das travas de estoque de camiseta contra o banco real.
// Roda com: npx tsx tmp/check-shirt-locks.ts
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { shirtSizesOfRegistration, normalizeShirtSize } from "../shared/shirtSizes.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const avail = await db.getShirtAvailability(EVENT);
  console.log("Disponível hoje:", avail.map(a => `${a.size}=${a.available}`).join(" "));

  // Os tamanhos são escolhidos AGORA, não chumbados: o estoque muda a cada
  // inscrição/cancelamento e um teste preso em "M está esgotado" quebra sozinho
  // sem nada de errado no sistema.
  const esgotado = avail.find(a => a.available <= 0);
  const comFolga = [...avail].sort((a, b) => b.available - a.available)[0];
  if (!esgotado || !comFolga || comFolga.available < 1) {
    throw new Error("preciso de um tamanho esgotado e um com folga no evento 1 para testar");
  }
  console.log(`Usando: esgotado=${esgotado.size}(${esgotado.available}) folga=${comFolga.size}(${comFolga.available})\n`);

  // 1) tamanho esgotado é barrado
  const c1 = await db.checkShirtSizesAvailable(EVENT, [esgotado.size]);
  check(`pedido de ${esgotado.size} (esgotado)`, !!c1, JSON.stringify(c1));

  // 2) tamanho com folga passa
  const c2 = await db.checkShirtSizesAvailable(EVENT, [comFolga.size]);
  check(`pedido de ${comFolga.size} (${comFolga.available} livres)`, c2 === null, String(c2));

  // 3) minúsculo antigo normaliza igual
  const c3 = await db.checkShirtSizesAvailable(EVENT, [esgotado.size.toLowerCase()]);
  check(`pedido de '${esgotado.size.toLowerCase()}' minúsculo`, !!c3, JSON.stringify(c3));

  // 4) pedir mais do que tem no mesmo pedido
  const demais = Array(comFolga.available + 1).fill(comFolga.size);
  const c4 = await db.checkShirtSizesAvailable(EVENT, demais);
  check(`${demais.length}x ${comFolga.size} com ${comFolga.available} livres`, !!c4, JSON.stringify(c4));

  // 5) EDIÇÃO que não mexe na camiseta não pode ser barrada — inclusive quando o
  // tamanho da inscrição está esgotado (ela já ocupa a própria vaga)
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const alvo = regs.find(r => r.status !== "cancelled"
    && shirtSizesOfRegistration(r).includes(esgotado.size)) || regs.find(r => r.status !== "cancelled");
  const mesmos = shirtSizesOfRegistration(alvo);
  const c5 = await db.checkShirtSizesAvailable(EVENT, mesmos, mesmos);
  check(`edição sem trocar tamanho (#${alvo.id}: ${mesmos.join("+")})`, c5 === null, String(c5));

  // 6) EDIÇÃO trocando esgotado -> com folga passa
  const c6 = await db.checkShirtSizesAvailable(EVENT, [comFolga.size], [esgotado.size]);
  check(`edição ${esgotado.size} -> ${comFolga.size}`, c6 === null, String(c6));

  // 7) EDIÇÃO trocando com folga -> esgotado é barrada
  const c7 = await db.checkShirtSizesAvailable(EVENT, [esgotado.size], [comFolga.size]);
  check(`edição ${comFolga.size} -> ${esgotado.size} (esgotado)`, !!c7, JSON.stringify(c7));

  // 8) evento sem estoque cadastrado não trava nada (retrocompatível)
  const c8 = await db.checkShirtSizesAvailable(99999, ["M", "M", "M"]);
  check("evento sem estoque cadastrado", c8 === null, String(c8));

  // 9) stock da loja passa a ser derivado do estoque por tamanho
  const prods = await db.getAvailableProducts({ eventId: EVENT });
  const p: any = prods[0];
  const somaPositivos = avail.reduce((acc, a) => acc + Math.max(0, a.available), 0);
  check("products.stock derivado", p?.stock === somaPositivos, `stock=${p?.stock} (soma disponíveis=${somaPositivos}) sizeAvailability=${p?.sizeAvailability?.length} tamanhos`);

  // 10) painel do organizador e vitrine mostram o MESMO numero (antes: 59 x 11)
  const doPainel = await db.getProductsByUserId(1, EVENT) as any[];
  const p2: any = doPainel[0];
  check("painel do organizador usa o estoque real", p2?.stock === somaPositivos,
    `painel=${p2?.stock} vitrine=${p?.stock} soma=${somaPositivos}`);
  check("painel marca controle por tamanho", p2?.stockControlledBySize === true,
    `stockControlledBySize=${p2?.stockControlledBySize} sizeAvailability=${p2?.sizeAvailability?.length}`);

  // 11) tamanho oferecido pela loja tem que existir no estoque do evento.
  // O dado gravado é texto livre antigo ("Inf 2, Inf 4, G3") — a leitura normaliza
  // e descarta o que não tem linha de estoque, então a UI nunca vê um órfão.
  const doEstoque = new Set(avail.map(a => a.size));
  const oferecidos = String(p2?.availableSizes || "").split(",").filter(Boolean);
  const orfaos = oferecidos.filter((s: string) => !doEstoque.has(s));
  check("tamanhos da loja existem no estoque", orfaos.length === 0,
    orfaos.length ? `sem estoque: ${orfaos.join(", ")}` : `${oferecidos.length} tamanhos, todos com linha de estoque`);

  const bruto = String((await db.getProductById(p2.id) as any)?.availableSizes || "");
  check("dado bruto continua intacto no banco", bruto.length > 0,
    `banco="${bruto}" -> exibido="${p2?.availableSizes}"`);

  // 12) sizeAvailability só traz o que a loja realmente vende
  const naVitrine = ((p2?.sizeAvailability || []) as any[]).map(s => s.size);
  check("disponibilidade só dos tamanhos vendidos",
    naVitrine.every((s: string) => oferecidos.includes(s)),
    `vende=[${oferecidos.join(",")}] mostra=[${naVitrine.join(",")}]`);

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
