// Teste read-only do vínculo do navegador, contra o banco real.
// Roda com: npm run check:navegador
//
// A inscrição continua tendo um dono só; o navegador entra por e-mail. O risco
// desse desenho é vazar inscrição pra quem não é da dupla, então metade dos
// checks aqui é sobre quem NÃO pode ver.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { getDb } from "../api/_server/db.js";
import { registrations, users } from "../api/_server/schema.js";
import {
  papelNaInscricao,
  pode,
  normalizarEmail,
  redigirParaNavegador,
} from "../shared/papelInscricao.js";

let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const d = await getDb();
  if (!d) throw new Error("sem banco");
  const todasRegs = await d.select().from(registrations) as any[];
  const contas = await d.select().from(users) as any[];
  const porOpenId = new Map(contas.map(u => [normalizarEmail(u.openId) || "", u]));
  const porId = new Map(contas.map(u => [Number(u.id), u]));

  // 1) Panorama de quem o vínculo alcança hoje
  const ativas = todasRegs.filter(r => r.status !== "cancelled");
  const comEmail = ativas.filter(r => normalizarEmail(r.navigatorEmail));
  const paresReais = comEmail
    .map(r => ({ reg: r, nav: porOpenId.get(normalizarEmail(r.navigatorEmail)!) }))
    .filter(p => !!p.nav && Number(p.nav.id) !== Number(p.reg.userId));
  const autoPreenchidas = comEmail.filter(r => {
    const u = porOpenId.get(normalizarEmail(r.navigatorEmail)!);
    return u && Number(u.id) === Number(r.userId);
  });
  console.log(`Inscrições ativas: ${ativas.length}`);
  console.log(`  com navegador: ${ativas.filter(r => r.navigatorName).length}`);
  console.log(`  com e-mail de navegador: ${comEmail.length}`);
  console.log(`  e-mail que é a conta do PRÓPRIO titular (não libera ninguém novo): ${autoPreenchidas.length}`);
  console.log(`  duplas de verdade (navegador com conta própria): ${paresReais.length}\n`);

  // 2) O OR do SQL, provado com um e-mail de navegador REAL — mesmo que esse
  // navegador ainda não tenha criado conta. É o mesmo caminho de query que roda
  // em produção; o id do usuário aqui é só o "não sou o dono".
  const alvo = comEmail.find(r => {
    const u = porOpenId.get(normalizarEmail(r.navigatorEmail)!);
    return !u || Number(u.id) !== Number(r.userId);
  }) || comEmail[0];
  const emailAlvo = normalizarEmail(alvo.navigatorEmail)!;
  const idQualquer = 999999;
  const comoNavegador = await db.getRegistrationsByUserId(idQualquer, emailAlvo) as any[];
  const achada = comoNavegador.find(l => l.id === alvo.id);
  check("quem tem o e-mail do navegador enxerga a inscrição", !!achada,
    `#${alvo.id} via ${emailAlvo} -> ${achada ? "apareceu" : "NÃO apareceu"}`);
  check("e ela vem marcada como não-titular", achada?.ehTitular === false,
    `ehTitular=${achada?.ehTitular}`);
  check("não vem junto inscrição de outra dupla",
    comoNavegador.every(l => normalizarEmail(l.navigatorEmail) === emailAlvo),
    `${comoNavegador.length} inscrição(ões) na lista`);

  // 3) Nenhuma regressão do titular: a lista nunca encolhe
  let semRegressao = true;
  const titulares = [...new Set(ativas.slice(0, 12).map(r => Number(r.userId)))];
  for (const titularId of titulares) {
    const conta = porId.get(titularId);
    const antes = await db.getRegistrationsByUserId(titularId) as any[];
    const depois = await db.getRegistrationsByUserId(titularId, conta?.openId) as any[];
    const sumiu = antes.filter(a => !depois.some(dd => dd.id === a.id));
    if (sumiu.length || depois.length < antes.length) {
      semRegressao = false;
      console.log(`      ^ user ${titularId}: antes=${antes.length} depois=${depois.length} sumiram=${sumiu.map(s => s.id).join(",")}`);
    }
  }
  check("titular continua vendo tudo o que via", semRegressao,
    `${titulares.length} titular(es) conferido(s)`);

  // 4) Quem não é da dupla não vê nada
  const idsEnvolvidos = new Set<number>(ativas.map(r => Number(r.userId)));
  for (const p of paresReais) idsEnvolvidos.add(Number(p.nav!.id));
  const estranhos = contas.filter(u => !idsEnvolvidos.has(Number(u.id))).slice(0, 3);
  let vazou = "";
  for (const u of estranhos) {
    const lista = await db.getRegistrationsByUserId(u.id, u.openId) as any[];
    const alheias = lista.filter(l => Number(l.userId) !== Number(u.id));
    if (alheias.length) vazou += ` ${u.openId}:${alheias.map(a => a.id).join(",")}`;
  }
  check("conta de fora não recebe inscrição alheia", vazou === "",
    vazou || `${estranhos.length} conta(s) testada(s)`);

  // Inscrição sem navegador nunca pode casar com conta sem openId ('' == '')
  const semNavegador = ativas.find(r => !normalizarEmail(r.navigatorEmail));
  check("inscrição sem e-mail de navegador não casa com ninguém",
    papelNaInscricao({ reg: semNavegador, user: { id: 999999, openId: "" } }) === null,
    `#${semNavegador?.id} navigatorEmail=${JSON.stringify(semNavegador?.navigatorEmail)}`);
  check("conta sem openId não vira navegador de nada",
    papelNaInscricao({ reg: alvo, user: { id: 999999, openId: null } }) === null, "null");
  const listaVazia = await db.getRegistrationsByUserId(999999, "") as any[];
  check("openId vazio não traz nada pelo SQL", listaVazia.length === 0, `${listaVazia.length} linha(s)`);

  // 5) Papel e permissões. Sem dupla real no banco, o navegador é sintético — a
  // regra é a mesma, muda só de onde vem a conta.
  const reg = paresReais[0]?.reg || alvo;
  const nav = paresReais[0]?.nav
    || { id: idQualquer, openId: normalizarEmail(reg.navigatorEmail), role: "participant" };
  const titular = porId.get(Number(reg.userId));
  const papelNav = papelNaInscricao({ reg, user: nav });
  check("papel do navegador", papelNav === "navegador",
    `${papelNav} (${paresReais.length ? "dupla real do banco" : "conta sintética: ainda não há dupla real"})`);
  check("papel do titular", papelNaInscricao({ reg, user: titular }) === "titular", `${titular?.openId}`);
  check("estranho não tem papel",
    papelNaInscricao({ reg, user: { id: 888888, openId: "ninguem@exemplo.com" } }) === null, "null");
  check("navegador BAIXA planilha", pode(papelNav, "planilha") === true, "planilha=true");
  check("navegador PAGA", pode(papelNav, "pagar") === true, "pagar=true");
  check("navegador NÃO edita", pode(papelNav, "editar") === false, "editar=false");
  check("navegador NÃO cancela", pode(papelNav, "cancelar") === false, "cancelar=false");
  check("sem papel não faz nada", !pode(null, "ver") && !pode(null, "planilha"), "null nega tudo");

  // 6) Redação: o navegador não leva documento nem contato do piloto
  const linha = (await db.getRegistrationsByUserId(Number(nav.id), nav.openId) as any[])
    .find(l => l.id === reg.id);
  const redigida = redigirParaNavegador(linha);
  const sensiveis = ["pilotCpf", "pilotEmail", "pilotPhone", "navigatorCPF", "transactionId"];
  const vazaram = sensiveis.filter(c => redigida[c] != null);
  check("navegador não recebe CPF/e-mail/telefone do piloto", vazaram.length === 0,
    vazaram.length ? `vazou: ${vazaram.join(", ")}` : sensiveis.join(", ") + " = null");
  check("o operacional continua na linha",
    !!redigida.pilotName && !!redigida.eventName && redigida.id === reg.id,
    `${redigida.pilotName} · ${redigida.eventName} · #${redigida.id}`);

  const linhaTitular = (await db.getRegistrationsByUserId(Number(reg.userId), titular?.openId) as any[])
    .find(l => l.id === reg.id);
  check("titular continua recebendo os dados completos",
    !!linhaTitular?.pilotCpf || !!linhaTitular?.pilotEmail,
    `cpf=${linhaTitular?.pilotCpf ? "ok" : "vazio"} email=${linhaTitular?.pilotEmail ? "ok" : "vazio"}`);
  check("linha do titular vem marcada como titular", linhaTitular?.ehTitular === true,
    `ehTitular=${linhaTitular?.ehTitular}`);

  // 7) Tolerância ao e-mail gravado cru (maiúscula/espaço)
  check("e-mail com maiúscula e espaço casa igual",
    papelNaInscricao({
      reg: { userId: 1, navigatorEmail: `  ${String(nav.openId).toUpperCase()} ` },
      user: nav as any,
    }) === "navegador",
    `"  ${String(nav.openId).toUpperCase()} " -> navegador`);

  // 8) Quem AINDA não é alcançado — é o que o Lucas precisa saber pra agir
  const semEmail = ativas.filter(r => r.navigatorName && !normalizarEmail(r.navigatorEmail));
  const esperandoConta = comEmail.filter(r => !porOpenId.get(normalizarEmail(r.navigatorEmail)!));
  console.log(`\nNavegadores que enxergam HOJE (conta já criada): ${paresReais.length}`);
  console.log(`Esperando o navegador criar conta com o e-mail da inscrição: ${esperandoConta.length}`);
  console.log(`Sem e-mail de navegador na inscrição (precisa preencher): ${semEmail.length}`);
  const suspeitos = comEmail.filter(r => (String(r.navigatorEmail).match(/@/g) || []).length > 1);
  if (suspeitos.length) {
    console.log(`E-MAIL SUSPEITO (nunca vai casar): ${suspeitos.map(r => `#${r.id} ${r.navigatorEmail}`).join(" | ")}`);
  }

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
