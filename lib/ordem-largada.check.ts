// Teste read-only do saneamento da ordem de largada, contra o banco real.
// Roda com: npm run check:ordem
//
// O bug: ao mudar a categoria de uma inscrição, o id continuava no
// registrationOrder da categoria ANTIGA e não entrava no da nova — o competidor
// aparecia duas vezes na lista de largada, com dois números.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { getDb } from "../api/_server/db.js";
import { startOrderConfig } from "../api/_server/schema.js";
import { eq } from "drizzle-orm";
import { sanearOrdem, parseOrdem, moverEntreCategorias, ordemPrecisaDeConserto } from "../shared/ordemLargada.js";
import { resolveStartOrder } from "../shared/startOrderLookup.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const regs = (await db.getRegistrationsByEventId(EVENT) as any[]);
  const ativas = regs.filter(r => r.status !== "cancelled");
  const cats = await db.getCategoriesByEventId(EVENT) as any[];
  const nome = (id: any) => cats.find(c => Number(c.id) === Number(id))?.name || `#${id}`;
  const porId = new Map(regs.map(r => [Number(r.id), r]));

  // A ordem CRUA do banco, sem passar pelo saneamento da camada de leitura
  const d = await getDb();
  if (!d) throw new Error("sem banco");
  const cruas = await d.select().from(startOrderConfig).where(eq(startOrderConfig.eventId, EVENT));
  const saneadas = await db.getStartOrderConfigByEvent(EVENT) as any[];

  // 1) Onde está sujo hoje
  const sujas = cruas.filter(c => {
    const ids = ativas.filter(r => Number(r.categoryId) === Number(c.categoryId)).map(r => Number(r.id));
    return ordemPrecisaDeConserto(c.registrationOrder, ids);
  });
  console.log(`Categorias com ordem suja no banco: ${sujas.length}/${cruas.length}`);
  for (const c of sujas) {
    const ids = ativas.filter(r => Number(r.categoryId) === Number(c.categoryId)).map(r => Number(r.id));
    const antes = parseOrdem(c.registrationOrder);
    const depois = sanearOrdem(c.registrationOrder, ids);
    const residuo = antes.filter(id => !depois.includes(id));
    const entrou = depois.filter(id => !antes.includes(id));
    console.log(`  ${nome(c.categoryId)}: ${antes.length} -> ${depois.length}` +
      (residuo.length ? ` | resíduo: ${residuo.map(i => `#${i} ${porId.get(i)?.pilotName || "(sumiu)"}`).join(", ")}` : "") +
      (entrou.length ? ` | entrou: ${entrou.map(i => `#${i} ${porId.get(i)?.pilotName}`).join(", ")}` : ""));
  }
  console.log("");

  // 2) A leitura já devolve limpo — é o que as telas consomem
  let duplicados: string[] = [];
  const ondeAparece = new Map<number, number[]>();
  for (const c of saneadas) {
    for (const id of parseOrdem(c.registrationOrder)) {
      if (!ondeAparece.has(id)) ondeAparece.set(id, []);
      ondeAparece.get(id)!.push(Number(c.categoryId));
    }
  }
  for (const [id, cs] of ondeAparece) {
    if (cs.length > 1) duplicados.push(`#${id} ${porId.get(id)?.pilotName} em ${cs.map(nome).join(" + ")}`);
  }
  check("ninguém aparece em duas categorias", duplicados.length === 0,
    duplicados.length ? duplicados.join(" | ") : `${ondeAparece.size} inscrições posicionadas`);

  let forasteiros: string[] = [];
  for (const c of saneadas) {
    for (const id of parseOrdem(c.registrationOrder)) {
      const r = porId.get(id);
      if (!r) { forasteiros.push(`#${id} não existe`); continue; }
      if (Number(r.categoryId) !== Number(c.categoryId)) forasteiros.push(`#${id} ${r.pilotName} (é de ${nome(r.categoryId)}, está em ${nome(c.categoryId)})`);
      if (r.status === "cancelled") forasteiros.push(`#${id} ${r.pilotName} cancelada`);
    }
  }
  check("a ordem só tem inscrição ativa da própria categoria", forasteiros.length === 0,
    forasteiros.length ? forasteiros.join(" | ") : "todas conferidas");

  let faltando: string[] = [];
  for (const r of ativas) {
    const cfg = saneadas.find(c => Number(c.categoryId) === Number(r.categoryId));
    if (!cfg) continue; // categoria sem config de largada
    if (!parseOrdem(cfg.registrationOrder).includes(Number(r.id))) {
      faltando.push(`#${r.id} ${r.pilotName} (${nome(r.categoryId)})`);
    }
  }
  check("todo inscrito ativo tem posição na própria categoria", faltando.length === 0,
    faltando.length ? faltando.join(" | ") : `${ativas.length} inscrições`);

  // 3) Todo mundo tem número, e o número é único no evento
  const numeros = new Map<number, string[]>();
  let semNumero: string[] = [];
  for (const r of ativas) {
    const { numero } = resolveStartOrder(r, saneadas);
    if (numero == null) { semNumero.push(`#${r.id} ${r.pilotName} (${nome(r.categoryId)})`); continue; }
    if (!numeros.has(numero)) numeros.set(numero, []);
    numeros.get(numero)!.push(`#${r.id} ${r.pilotName}`);
  }
  check("todo inscrito ativo tem número de largada", semNumero.length === 0,
    semNumero.length ? semNumero.join(" | ") : `${ativas.length} com número`);
  const repetidos = [...numeros.entries()].filter(([, l]) => l.length > 1);
  check("nenhum número de largada repetido", repetidos.length === 0,
    repetidos.length ? repetidos.map(([n, l]) => `${n}: ${l.join(" e ")}`).join(" | ") : `${numeros.size} números distintos`);

  // 4) A função pura, nos casos que importam
  check("resíduo sai e faltante entra no FIM",
    JSON.stringify(sanearOrdem([10, 99, 11], [10, 11, 12])) === JSON.stringify([10, 11, 12]),
    "[10,99,11] + falta 12 -> [10,11,12]");
  check("ordem do sorteio é preservada",
    JSON.stringify(sanearOrdem([30, 10, 20], [10, 20, 30])) === JSON.stringify([30, 10, 20]),
    "[30,10,20] -> [30,10,20]");
  check("id repetido no array não duplica",
    JSON.stringify(sanearOrdem([10, 10, 11], [10, 11])) === JSON.stringify([10, 11]), "[10,10,11] -> [10,11]");
  check("ordem em string (json) é aceita",
    JSON.stringify(sanearOrdem("[10,11]", [10, 11])) === JSON.stringify([10, 11]), '"[10,11]" -> [10,11]');
  check("lixo não quebra", JSON.stringify(sanearOrdem("nada disso", [7])) === JSON.stringify([7]), "-> [7]");
  check("troca de categoria: sai da antiga",
    JSON.stringify(moverEntreCategorias([1, 2, 3], 2, "remover")) === JSON.stringify([1, 3]), "[1,2,3] - 2 -> [1,3]");
  check("troca de categoria: entra no fim da nova",
    JSON.stringify(moverEntreCategorias([4, 5], 2, "acrescentar")) === JSON.stringify([4, 5, 2]), "[4,5] + 2 -> [4,5,2]");
  check("acrescentar duas vezes não duplica",
    JSON.stringify(moverEntreCategorias([4, 2], 2, "acrescentar")) === JSON.stringify([4, 2]), "[4,2] + 2 -> [4,2]");

  // 5) Nenhum número mudou por causa da limpeza (o que já foi impresso continua valendo)
  const mudaram: string[] = [];
  for (const r of ativas) {
    const antes = resolveStartOrder(r, cruas as any[]);
    const depois = resolveStartOrder(r, saneadas);
    if (antes.numero != null && depois.numero !== antes.numero) {
      mudaram.push(`#${r.id} ${r.pilotName}: ${antes.numero} -> ${depois.numero}`);
    }
  }
  check("limpeza não mexe em número já atribuído", mudaram.length === 0,
    mudaram.length ? mudaram.join(" | ") : "todos os números preservados");

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
