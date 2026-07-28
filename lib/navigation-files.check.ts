// Teste read-only do gate das planilhas de navegação, usando inscrições REAIS do banco.
// Roda com: npm run check:nav-files
//
// Não escreve nada: as planilhas são montadas em memória e cruzadas com inscrições
// de verdade (categoria + status de pagamento) para provar quem baixa o quê.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { sanitizeNavigationFiles } from "../shared/navigationFiles.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

const ONTEM = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const AMANHA = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

async function main() {
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const paga = regs.find(r => r.status === "paid");
  const pendente = regs.find(r => r.status === "pending");
  if (!paga || !pendente) throw new Error("Preciso de uma inscrição paga e uma pendente no evento 1");

  const outraCategoria = regs.find(r => r.categoryId !== paga.categoryId)?.categoryId;
  console.log(`Inscrições reais: paga #${paga.id} (cat ${paga.categoryId}) | pendente #${pendente.id} (cat ${pendente.categoryId})`);

  const planilhas = [
    { id: "ja-liberada", name: "dia1.nbp", url: "https://r2/dia1.nbp", type: "nbp", categoryId: null, releaseAt: ONTEM },
    { id: "agendada", name: "dia2.nbp", url: "https://r2/dia2.nbp", type: "nbp", categoryId: null, releaseAt: AMANHA },
    { id: "sem-data", name: "geral.bin", url: "https://r2/geral.bin", type: "bin", categoryId: null, releaseAt: null },
    { id: "outra-cat", name: "outra.nbp", url: "https://r2/outra.nbp", type: "nbp", categoryId: outraCategoria, releaseAt: ONTEM },
    { name: "antiga-sem-id.nbp", url: "https://r2/antiga.nbp", type: "nbp", categoryId: null },
  ];

  const paraPaga = sanitizeNavigationFiles(planilhas, { categoryId: paga.categoryId, registrationStatus: paga.status });
  const paraPendente = sanitizeNavigationFiles(planilhas, { categoryId: pendente.categoryId, registrationStatus: pendente.status });
  const paraOrganizador = sanitizeNavigationFiles(planilhas, { categoryId: pendente.categoryId, registrationStatus: pendente.status, bypass: true });

  const de = (lista: any[], id: string) => lista.find(f => f.id === id);

  // 1) paga + hora já passou -> libera e manda a url
  const a = de(paraPaga, "ja-liberada");
  check("paga + releaseAt no passado", !!a && !a.locked && !!a.url, JSON.stringify(a));

  // 2) paga + hora no futuro -> bloqueada por agenda, SEM url
  const b = de(paraPaga, "agendada");
  check("paga + releaseAt no futuro", !!b && b.locked && b.lockReason === "schedule" && !b.url, JSON.stringify(b));

  // 3) sem data -> libera pra quem pagou (retrocompatível com o que já está no ar)
  const c = de(paraPaga, "sem-data");
  check("paga + sem releaseAt", !!c && !c.locked && !!c.url, JSON.stringify(c));

  // 4) pendente -> tudo bloqueado por pagamento, SEM url, mesmo a que já liberou
  const d = de(paraPendente, "ja-liberada");
  const e = de(paraPendente, "sem-data");
  check("pendente vê bloqueado por pagamento", !!d && d.locked && d.lockReason === "payment" && !d.url, JSON.stringify(d));
  check("pendente sem url em nenhuma", !!e && !e.url && paraPendente.every(f => !f.url), `${paraPendente.length} planilhas, nenhuma com url`);

  // 5) pagamento tem prioridade sobre agenda na mensagem
  const f = de(paraPendente, "agendada");
  check("pendente + agendada mostra pagamento", !!f && f.lockReason === "payment", JSON.stringify(f));

  // 6) planilha de outra categoria não aparece nem pra quem pagou
  check("planilha de outra categoria some", outraCategoria === undefined || !de(paraPaga, "outra-cat"), `outraCategoria=${outraCategoria} presente=${!!de(paraPaga, "outra-cat")}`);

  // 7) planilha antiga (sem id) ganha id pelo índice e continua acessível
  const g = paraPaga.find(x => x.name === "antiga-sem-id.nbp");
  check("planilha antiga sem id", !!g && g.id === "4" && !g.locked && !!g.url, JSON.stringify(g));

  // 8) organizador/admin enxerga tudo liberado mesmo com inscrição pendente
  check("bypass do organizador", paraOrganizador.every(x => !x.locked && !!x.url), `${paraOrganizador.length} planilhas, todas com url`);

  // 9) planilha de DUAS categorias aparece nas duas e some nas outras
  if (outraCategoria !== undefined) {
    const duasCats = [{
      id: "duas-cats", name: "graduado-e-turismo.nbp", url: "https://r2/duas.nbp", type: "nbp",
      categoryIds: [paga.categoryId, outraCategoria], categoryId: null, releaseAt: ONTEM,
    }];
    const naPrimeira = sanitizeNavigationFiles(duasCats, { categoryId: paga.categoryId, registrationStatus: "paid" });
    const naSegunda = sanitizeNavigationFiles(duasCats, { categoryId: outraCategoria, registrationStatus: "paid" });
    const terceira = regs.find(r => r.categoryId !== paga.categoryId && r.categoryId !== outraCategoria)?.categoryId;
    const naTerceira = terceira === undefined
      ? []
      : sanitizeNavigationFiles(duasCats, { categoryId: terceira, registrationStatus: "paid" });

    check("multi: aparece na 1ª categoria", naPrimeira.length === 1 && !!naPrimeira[0].url, `cat ${paga.categoryId}`);
    check("multi: aparece na 2ª categoria", naSegunda.length === 1 && !!naSegunda[0].url, `cat ${outraCategoria}`);
    check("multi: some numa 3ª categoria", terceira === undefined || naTerceira.length === 0, `cat ${terceira}`);
    check("multi: devolve categoryIds", naPrimeira[0]?.categoryIds?.length === 2, JSON.stringify(naPrimeira[0]?.categoryIds));

    // multi + agenda: continua bloqueando nas duas
    const futura = [{ ...duasCats[0], releaseAt: AMANHA }];
    const bloq1 = sanitizeNavigationFiles(futura, { categoryId: paga.categoryId, registrationStatus: "paid" })[0];
    const bloq2 = sanitizeNavigationFiles(futura, { categoryId: outraCategoria, registrationStatus: "paid" })[0];
    check("multi + agendada bloqueia nas duas",
      bloq1?.locked && !bloq1?.url && bloq2?.locked && !bloq2?.url,
      `${bloq1?.lockReason}/${bloq2?.lockReason}`);
  }

  // 10) planilha legada (categoryId único, sem categoryIds) continua funcionando
  const legada = [{ id: "legada", name: "legada.nbp", url: "https://r2/legada.nbp", type: "nbp", categoryId: paga.categoryId, releaseAt: null }];
  const legadaNaCat = sanitizeNavigationFiles(legada, { categoryId: paga.categoryId, registrationStatus: "paid" });
  const legadaForaDaCat = outraCategoria === undefined
    ? []
    : sanitizeNavigationFiles(legada, { categoryId: outraCategoria, registrationStatus: "paid" });
  check("legada categoryId único ainda vale", legadaNaCat.length === 1 && !!legadaNaCat[0].url, JSON.stringify(legadaNaCat[0]?.categoryIds));
  check("legada não vaza pra outra categoria", legadaForaDaCat.length === 0, `${legadaForaDaCat.length} planilhas`);

  // 11) o payload real de myRegistrations não vaza url pra inscrição pendente
  const doUsuario = await db.getRegistrationsByUserId(pendente.userId) as any[];
  const comoNoRouter = doUsuario.map(r => ({
    ...r,
    eventNavigationFiles: sanitizeNavigationFiles(planilhas, { categoryId: r.categoryId, registrationStatus: r.status }),
  }));
  const vazou = JSON.stringify(comoNoRouter.filter(r => r.status !== "paid")).includes("https://r2/");
  check("payload real do usuário pendente", !vazou, vazou ? "VAZOU url no JSON" : "nenhuma url no JSON");

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
