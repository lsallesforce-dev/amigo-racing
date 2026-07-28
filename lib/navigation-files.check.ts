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

  // 9) o payload real de myRegistrations não vaza url pra inscrição pendente
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
