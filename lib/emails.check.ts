// Teste read-only da central de e-mails, com os dados reais do Rally do Cavalo.
// Roda com: npm run check:emails
//
// NÃO envia e-mail e NÃO grava disparo: exercita a montagem da lista, a
// substituição das variáveis e a régua de cobrança (esta em dry-run).
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { processarCobrancasPendentes } from "../api/_server/cronCobranca.js";
import { renderEmail, textoParaHtml, escapeHtml } from "../shared/emailLayout.js";
import { valoresDaInscricao, aplicarVariaveis, aplicarVariaveisTexto, variaveisDesconhecidas } from "../shared/emailVars.js";
import { resolveStartOrder } from "../shared/startOrderLookup.js";
import { marcoDevidoHoje } from "../shared/cobrancaTemplate.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

const DIA = 24 * 3600 * 1000;

async function main() {
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const evento = await db.getEventById(EVENT) as any;
  const configs = await db.getStartOrderConfigsByEventId(EVENT) as any[];

  const pagas = regs.filter(r => r.status === "paid").length;
  const pendentes = regs.filter(r => r.status === "pending").length;
  console.log(`Evento: ${evento?.name} | pagas: ${pagas} | pendentes: ${pendentes}`);

  // ---- 1) lista de destinatários por filtro
  const soPagos = await db.getEventEmailAudience(EVENT, { status: "paid" });
  const soPendentes = await db.getEventEmailAudience(EVENT, { status: "pending" });
  const todos = await db.getEventEmailAudience(EVENT, { status: "all" });

  check("filtro 'pagos' bate com as inscrições pagas", soPagos.length === pagas, `${soPagos.length} de ${pagas}`);
  check("filtro 'pendentes' bate", soPendentes.length === pendentes, `${soPendentes.length} de ${pendentes}`);
  check("'todos' = pagos + pendentes", todos.length === pagas + pendentes, `${todos.length}`);

  // ---- 2) desduplicação e validade
  const comNavegador = await db.getEventEmailAudience(EVENT, { status: "all", incluirNavegador: true });
  const emails = comNavegador.map(d => d.email);
  check("nenhum e-mail repetido", new Set(emails).size === emails.length,
    `${emails.length} destinatários, ${new Set(emails).size} únicos`);
  check("todos em minúsculas", emails.every(e => e === e.toLowerCase()), `${emails.length} conferidos`);
  check("nenhum e-mail inválido", emails.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)), "formato ok");
  check("navegador soma destinatários", comNavegador.length >= todos.length,
    `sem navegador=${todos.length} com=${comNavegador.length}`);

  // ---- 3) cancelada nunca recebe
  const canceladas = (await db.getRegistrationsByEventId(EVENT) as any[]).filter(r => r.status === "cancelled");
  const emailsCancelados = canceladas.map(r => String(r.pilotEmail || "").toLowerCase()).filter(Boolean);
  const vazou = emailsCancelados.filter(e => emails.includes(e) &&
    !regs.some(r => r.status !== "cancelled" && String(r.pilotEmail).toLowerCase() === e));
  check("inscrição cancelada fora da lista", vazou.length === 0,
    `${canceladas.length} canceladas, ${vazou.length} vazaram`);

  // ---- 4) variáveis resolvidas contra uma inscrição real
  const comLargada = regs.find(r => {
    const l = resolveStartOrder(r, configs);
    return r.status !== "cancelled" && l.numero !== null && l.horario !== null;
  }) || regs.find(r => r.status !== "cancelled");
  const largada = resolveStartOrder(comLargada, configs);
  const valores = valoresDaInscricao({
    reg: comLargada, evento,
    categoriaNome: comLargada.categoryGroup ? `${comLargada.categoryGroup} - ${comLargada.categoryName}` : comLargada.categoryName,
    numero: largada.numero, horario: largada.horario,
  });

  const texto = "Olá {{piloto}}, você é o {{numero}} e larga às {{horario_largada}} na {{categoria}}.";
  const resolvido = aplicarVariaveisTexto(texto, valores);
  check("variáveis resolvidas", !resolvido.includes("{{") && resolvido.includes(String(valores.piloto)),
    resolvido);
  check("{{numero}} igual ao da ordem de largada",
    valores.numero === (largada.numero !== null ? String(largada.numero) : "-"),
    `numero=${valores.numero} horario=${valores.horario_largada}`);
  check("{{evento}} e {{data_evento}} preenchidos",
    !!valores.evento && !!valores.data_evento, `${valores.evento} · ${valores.data_evento}`);

  // startDate é timestamp SEM fuso (relógio de parede). Converter pra Brasília
  // subtrairia 3h e o e-mail anunciaria o rally num dia/hora que não existe.
  const [diaBanco] = String(evento.startDate instanceof Date
    ? evento.startDate.toISOString()
    : evento.startDate).split("T");
  const [ano, mes, dia] = diaBanco.split("-");
  check("{{data_evento}} igual ao que está no banco",
    valores.data_evento === `${dia}/${mes}/${ano}`,
    `banco=${diaBanco} email=${valores.data_evento}`);

  // ---- 5) segurança: nome com HTML não injeta no e-mail
  const malicioso = valoresDaInscricao({
    reg: { pilotName: `<script>alert('x')</script> & "aspas"`, status: "paid" }, evento,
  });
  const html = aplicarVariaveis(textoParaHtml("Olá {{piloto}}!"), malicioso);
  check("nome com HTML sai escapado",
    !html.includes("<script>") && html.includes("&lt;script&gt;") && html.includes("&amp;"),
    html.slice(0, 90));
  check("escapeHtml cobre aspas", escapeHtml(`"a" & 'b'`) === "&quot;a&quot; &amp; &#39;b&#39;", escapeHtml(`"a" & 'b'`));

  // ---- 6) variável inexistente é detectada e sai em branco
  check("variável desconhecida detectada",
    variaveisDesconhecidas("Olá {{piloto}} {{inventada}}").join(",") === "inventada", "inventada");
  check("variável desconhecida vira vazio",
    aplicarVariaveisTexto("[{{inventada}}]", valores) === "[]", "[]");

  // ---- 7) o e-mail montado é HTML íntegro
  const corpo = renderEmail({ bodyHtml: aplicarVariaveis(textoParaHtml(texto), valores), eventName: evento?.name });
  check("HTML do e-mail montado", corpo.startsWith("<!DOCTYPE html>") && corpo.includes("</html>"),
    `${corpo.length} caracteres`);

  // ---- 8) régua de cobrança: marcos
  const hoje = new Date();
  const marco = (diasAtras: number, diasAteEvento: number, jaEnviados: string[] = []) =>
    marcoDevidoHoje({
      criadaEm: new Date(hoje.getTime() - diasAtras * DIA),
      dataEvento: new Date(hoje.getTime() + diasAteEvento * DIA),
      jaEnviados, agora: hoje,
    });

  check("inscrição de hoje ainda não cobra", marco(0, 30) === null, "null");
  check("1 dia -> marco d1", marco(1, 30) === "d1", String(marco(1, 30)));
  check("3 dias sem ter recebido d1 -> d1 primeiro", marco(3, 30) === "d1", String(marco(3, 30)));
  check("3 dias já tendo d1 -> d3", marco(3, 30, ["d1"]) === "d3", String(marco(3, 30, ["d1"])));
  check("véspera do evento -> vespera", marco(10, 1, ["d1", "d3"]) === "vespera", String(marco(10, 1, ["d1", "d3"])));
  check("todos os marcos enviados -> para", marco(10, 1, ["d1", "d3", "vespera"]) === null, "null");
  check("evento já passou -> não cobra", marco(10, -1) === null, "null");
  check("rodar de novo no mesmo dia não repete", marco(1, 30, ["d1"]) === "d3" || marco(1, 30, ["d1"]) === null,
    String(marco(1, 30, ["d1"])));

  // ---- 9) o cron não faz nada com a régua desligada (estado atual)
  const eventosLigados = await db.getEventsWithAutoCharge() as any[];
  const dry = await processarCobrancasPendentes({ dryRun: true });
  check("cron respeita a régua desligada",
    eventosLigados.length > 0 || dry.enviados === 0,
    `eventos com régua ligada=${eventosLigados.length} enviaria=${dry.enviados}`);

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
