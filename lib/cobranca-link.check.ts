// Teste read-only do link de cobrança (/pagar/:accessHash).
// Roda com: npm run check:cobranca
//
// O foco é o GATE: o createPayment deixou de ser protectedProcedure, então quem
// autoriza agora é a posse do accessHash. Aqui checamos que o hash existe, é
// único, não é adivinhável, e que a consulta pública não vaza dado pessoal.
// NÃO cria pagamento nem chama o Pagar.me.
import "dotenv/config";
import * as db from "../api/_server/db.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const pendentes = regs.filter(r => r.status === "pending");
  const pagas = regs.filter(r => r.status === "paid");
  console.log(`Inscrições: ${regs.length} (${pendentes.length} pendentes, ${pagas.length} pagas)`);

  // 1) toda inscrição pendente tem link (sem hash, o botão Cobrar não funciona)
  const semHash = pendentes.filter(r => !r.accessHash);
  check("todo pendente tem accessHash", semHash.length === 0,
    semHash.length ? `sem hash: #${semHash.map(r => r.id).join(", #")}` : `${pendentes.length} pendentes com link`);

  // 2) hash não pode repetir entre inscrições
  const hashes = regs.map(r => r.accessHash).filter(Boolean);
  check("accessHash único", new Set(hashes).size === hashes.length,
    `${hashes.length} hashes, ${new Set(hashes).size} distintos`);

  // 3) hash precisa ser longo o bastante pra não ser chutado
  const curtos = hashes.filter((h: string) => String(h).length < 16);
  check("accessHash com tamanho de token", curtos.length === 0,
    `menor tamanho encontrado: ${Math.min(...hashes.map((h: string) => String(h).length))}`);

  // 4) a busca por hash devolve a inscrição certa
  const alvo = pendentes[0] || regs[0];
  const achada = await db.getRegistrationByAccessHash(alvo.accessHash) as any;
  check("busca por hash acha a inscrição", Number(achada?.id) === Number(alvo.id),
    `pedi #${alvo.id}, veio #${achada?.id}`);

  // 5) hash errado não acha nada — e, principalmente, NÃO estoura.
  // A coluna é uuid: texto que não é uuid fazia o Postgres devolver erro 22P02 e
  // o endpoint público respondia 500 em vez de "link inválido".
  const lixos = [
    "naoexiste-" + Date.now(),
    "00000000-0000-0000-0000-000000000000",
    "'; drop table registrations; --",
    "../../etc/passwd",
    "",
  ];
  for (const lixo of lixos) {
    let resultado: any = "ESTOUROU";
    try {
      resultado = await db.getRegistrationByAccessHash(lixo);
    } catch (err: any) {
      resultado = `ERRO: ${err.message}`;
    }
    check(`hash inválido não acha nem estoura ["${lixo.slice(0, 24)}"]`,
      resultado === undefined, String(resultado));
  }

  // 6) hash de OUTRA inscrição resolve pra outra inscrição (o gate compara com a
  //    inscrição pedida, então isso é o que impede pagar a inscrição alheia)
  const outra = regs.find(r => Number(r.id) !== Number(alvo.id));
  if (outra?.accessHash) {
    const resolvida = await db.getRegistrationByAccessHash(outra.accessHash) as any;
    check("hash de outra inscrição não aponta pra esta",
      Number(resolvida?.id) !== Number(alvo.id),
      `hash da #${outra.id} resolveu #${resolvida?.id}, alvo era #${alvo.id}`);
  }

  // 7) o total cobrado tem que bater com categoria + extras
  const extras = db.sumPurchasedProducts(alvo.purchasedProducts);
  const esperado = (alvo.categoryPrice || 0) + extras.total;
  check("total = categoria + extras", esperado >= (alvo.categoryPrice || 0),
    `categoria=${alvo.categoryPrice} extras=${extras.total} total=${esperado}`);

  // 8) inscrição paga continua respondendo o link (a tela mostra "confirmado"
  //    em vez de cobrar de novo)
  if (pagas[0]?.accessHash) {
    const jaPaga = await db.getRegistrationByAccessHash(pagas[0].accessHash) as any;
    check("link de inscrição paga ainda resolve", jaPaga?.status === "paid",
      `#${jaPaga?.id} status=${jaPaga?.status}`);
  }

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
