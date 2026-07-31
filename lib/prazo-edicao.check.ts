// Teste read-only da trava de edição da inscrição.
// Roda com: npm run check:prazo-edicao
//
// Simula a passagem do tempo contra a data REAL do Rally do Cavalo, para provar
// exatamente em que dia o competidor deixa de conseguir editar.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { estadoPrazoEdicao, mensagemPrazoEdicao, PRAZO_EDICAO_PADRAO } from "../shared/prazoEdicao.js";
import { formatarDataDoBanco } from "../shared/horarioBrasilia.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

const DIA = 86400000;

async function main() {
  const evento = await db.getEventById(EVENT) as any;
  const startDate = evento.startDate;
  const prazo = evento.editDeadlineDays ?? PRAZO_EDICAO_PADRAO;
  console.log(`Evento: ${evento.name} | ${formatarDataDoBanco(startDate)} | trava: ${prazo} dia(s) antes\n`);

  // A data do evento é timestamp SEM fuso; a conta usa os componentes UTC.
  const evUtc = new Date(startDate instanceof Date ? startDate : new Date(startDate));
  const emDiasAntes = (n: number) => new Date(evUtc.getTime() - n * DIA);

  // Linha do tempo em cima da data real
  for (const dias of [10, 5, 3, 2, 1, 0, -1]) {
    const est = estadoPrazoEdicao({ startDate, editDeadlineDays: prazo, agora: emDiasAntes(dias) });
    const esperado = dias > prazo;
    const rotulo = dias < 0 ? "1 dia DEPOIS" : dias === 0 ? "no dia do evento" : `${dias} dia(s) antes`;
    check(`${rotulo}: ${esperado ? "pode editar" : "travado"}`,
      est.bloqueado === !esperado,
      `bloqueado=${est.bloqueado} motivo=${est.motivo} restantes=${est.diasRestantes}`);
  }

  // A virada tem que ser exatamente entre prazo+1 e prazo
  const véspera = estadoPrazoEdicao({ startDate, editDeadlineDays: prazo, agora: emDiasAntes(prazo + 1) });
  const noPrazo = estadoPrazoEdicao({ startDate, editDeadlineDays: prazo, agora: emDiasAntes(prazo) });
  check("vira exatamente no limite", !véspera.bloqueado && noPrazo.bloqueado,
    `${prazo + 1} dias antes=livre, ${prazo} dias antes=travado`);

  // prazo 0 desliga a trava até o dia do evento
  const semTrava = estadoPrazoEdicao({ startDate, editDeadlineDays: 0, agora: emDiasAntes(0) });
  check("prazo 0 deixa editar no dia", !semTrava.bloqueado, `bloqueado=${semTrava.bloqueado}`);

  // ...mas depois que o evento passa, ninguém edita
  const passou = estadoPrazoEdicao({ startDate, editDeadlineDays: 0, agora: emDiasAntes(-2) });
  check("evento passado trava mesmo com prazo 0",
    passou.bloqueado && passou.motivo === "evento_passou", `motivo=${passou.motivo}`);

  // Evento sem data não pode travar ninguém
  const semData = estadoPrazoEdicao({ startDate: null, editDeadlineDays: 2 });
  check("evento sem data não trava", !semData.bloqueado, `bloqueado=${semData.bloqueado}`);

  // Mensagens
  check("mensagem de prazo explica o motivo",
    mensagemPrazoEdicao(noPrazo).includes("antes do evento") && mensagemPrazoEdicao(noPrazo).includes("organização"),
    `"${mensagemPrazoEdicao(noPrazo)}"`);
  check("mensagem de evento passado é diferente",
    mensagemPrazoEdicao(passou).includes("já aconteceu"), `"${mensagemPrazoEdicao(passou)}"`);
  check("sem bloqueio, sem mensagem", mensagemPrazoEdicao(véspera) === "", '""');

  // Estado de HOJE, com o evento real
  const hoje = estadoPrazoEdicao({ startDate, editDeadlineDays: prazo });
  console.log(`\nHOJE: faltam ${hoje.diasRestantes} dia(s) -> competidor ${hoje.bloqueado ? "NÃO edita mais" : "ainda edita"}`);
  if (hoje.bloqueado) console.log(`      "${mensagemPrazoEdicao(hoje)}"`);

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
