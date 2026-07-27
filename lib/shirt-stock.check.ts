// Teste read-only das travas de estoque de camiseta contra o banco real.
// Roda com: npx tsx tmp/check-shirt-locks.ts
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { shirtSizesOfRegistration } from "../shared/shirtSizes.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const avail = await db.getShirtAvailability(EVENT);
  console.log("Disponível hoje:", avail.map(a => `${a.size}=${a.available}`).join(" "));

  // 1) tamanho esgotado é barrado
  const c1 = await db.checkShirtSizesAvailable(EVENT, ["M"]);
  check("pedido de M (esgotado)", !!c1, JSON.stringify(c1));

  // 2) tamanho com folga passa
  const c2 = await db.checkShirtSizesAvailable(EVENT, ["G2"]);
  check("pedido de G2 (5 livres)", c2 === null, String(c2));

  // 3) minúsculo antigo normaliza igual
  const c3 = await db.checkShirtSizesAvailable(EVENT, ["m"]);
  check("pedido de 'm' minúsculo", !!c3, JSON.stringify(c3));

  // 4) pedir mais do que tem no mesmo pedido
  const c4 = await db.checkShirtSizesAvailable(EVENT, ["G2", "G2", "G2", "G2", "G2", "G2"]);
  check("6x G2 com 5 livres", !!c4, JSON.stringify(c4));

  // 5) EDIÇÃO que não mexe na camiseta não pode ser barrada
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const alvo = regs.find(r => r.status !== "cancelled" && String(r.pilotShirtSize).toUpperCase() === "M");
  const mesmos = shirtSizesOfRegistration(alvo);
  const c5 = await db.checkShirtSizesAvailable(EVENT, mesmos, mesmos);
  check(`edição sem trocar tamanho (#${alvo.id}, M esgotado)`, c5 === null, String(c5));

  // 6) EDIÇÃO trocando M -> G2 (tem folga) passa
  const c6 = await db.checkShirtSizesAvailable(EVENT, ["G2"], ["M"]);
  check("edição M -> G2", c6 === null, String(c6));

  // 7) EDIÇÃO trocando G2 -> M (esgotado) é barrada
  const c7 = await db.checkShirtSizesAvailable(EVENT, ["M"], ["G2"]);
  check("edição G2 -> M (esgotado)", !!c7, JSON.stringify(c7));

  // 8) evento sem estoque cadastrado não trava nada (retrocompatível)
  const c8 = await db.checkShirtSizesAvailable(99999, ["M", "M", "M"]);
  check("evento sem estoque cadastrado", c8 === null, String(c8));

  // 9) stock da loja passa a ser derivado do estoque por tamanho
  const prods = await db.getAvailableProducts({ eventId: EVENT });
  const p: any = prods[0];
  const somaPositivos = avail.reduce((acc, a) => acc + Math.max(0, a.available), 0);
  check("products.stock derivado", p?.stock === somaPositivos, `stock=${p?.stock} (soma disponíveis=${somaPositivos}) sizeAvailability=${p?.sizeAvailability?.length} tamanhos`);

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
