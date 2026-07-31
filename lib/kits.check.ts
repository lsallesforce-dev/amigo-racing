// Teste read-only da montagem de kits contra o banco real.
// Roda com: npm run check:kits
//
// O que importa aqui é o RESUMO: se o total por tamanho divergir do reservado
// que o estoque já calcula, uma das duas contas está errada — e é melhor
// descobrir agora do que na frente da caixa da estamparia.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { montarDadosDeKits, gradeDeEtiquetas, folhasDeEtiquetas } from "../shared/kits.js";
import { resolveStartOrder } from "../shared/startOrderLookup.js";
import { formatarTelefone, somenteDigitos } from "../shared/telefone.js";

const EVENT = 1;
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const evento = await db.getEventById(EVENT) as any;
  const regs = await db.getRegistrationsByEventId(EVENT) as any[];
  const categories = await db.getCategoriesByEventId(EVENT) as any[];
  const startConfigs = await db.getStartOrderConfigByEvent(EVENT) as any[];

  const dados = montarDadosDeKits(regs, categories, startConfigs);
  console.log(`Evento: ${evento.name} | ${regs.length} inscrições no banco\n`);

  // 1) cancelado fora, o resto dentro
  const naoCancelados = regs.filter(r => r.status !== "cancelled").length;
  const cancelados = regs.length - naoCancelados;
  check("kits = inscrições não canceladas", dados.totalKits === naoCancelados,
    `kits=${dados.totalKits} nãoCancelados=${naoCancelados} (${cancelados} cancelada(s) fora)`);

  // 2) pendente entra e vem marcado
  const pendentes = regs.filter(r => r.status !== "cancelled" && r.status !== "paid").length;
  check("pendentes entram marcados", dados.totalPendentes === pendentes,
    `pendentes no PDF=${dados.totalPendentes} no banco=${pendentes}`);

  // 3) ninguém se perde no agrupamento por categoria
  const somaGrupos = dados.grupos.reduce((acc, g) => acc + g.kits.length, 0);
  check("agrupamento não perde ninguém", somaGrupos === dados.totalKits,
    `${dados.grupos.length} categoria(s), soma=${somaGrupos} total=${dados.totalKits}`);

  // 4) O NÚMERO QUE INTERESSA: total por tamanho x consumido do estoque.
  //
  // O `used` do estoque conta as camisetas das inscrições MAIS os pedidos
  // avulsos da loja (product_orders sem inscrição). Kit não é feito de pedido
  // avulso, então o esperado é kits <= used; a diferença são os avulsos, e ela
  // é impressa porque significa camiseta na caixa da estamparia que não vai
  // dentro de nenhum saco.
  const avail = await db.getShirtAvailability(EVENT) as any[];
  const usado = new Map<string, number>(avail.map(a => [a.size, Number(a.used ?? 0)]));
  const doPdf = new Map(dados.totaisPorTamanho.map(t => [t.size, t.total]));
  const tamanhos = new Set([...usado.keys(), ...doPdf.keys()]);
  const acimaDoEstoque: string[] = [];
  const avulsos: string[] = [];
  for (const size of tamanhos) {
    const kits = doPdf.get(size) || 0;
    const used = usado.get(size) || 0;
    if (kits > used) acimaDoEstoque.push(`${size}: kits=${kits} > estoque=${used}`);
    else if (kits < used) avulsos.push(`${size}: ${used - kits}`);
  }
  check("resumo nunca passa do consumido do estoque", acimaDoEstoque.length === 0,
    acimaDoEstoque.length ? acimaDoEstoque.join(" | ")
      : dados.totaisPorTamanho.map(t => `${t.size}=${t.total}`).join(" "));
  if (avulsos.length) {
    console.log(`      ^ fora dos kits (pedidos avulsos da loja): ${avulsos.join(", ")}`);
  }

  check("total de camisetas confere com a soma",
    dados.totalCamisetas === dados.totaisPorTamanho.reduce((a, t) => a + t.total, 0),
    `${dados.totalCamisetas} camisetas`);

  // 5) número e horário iguais aos da Listagem de Inscritos (mesma fonte)
  const comNumero = dados.kits.filter(k => k.numero != null);
  const divergentesNum = comNumero.filter(k => {
    const reg = regs.find(r => r.id === k.id);
    const esperado = resolveStartOrder(reg, startConfigs);
    return esperado.numero !== k.numero || esperado.horario !== k.horario;
  });
  check("número/horário batem com a ordem de largada", divergentesNum.length === 0,
    `${comNumero.length} com número; ${divergentesNum.length} divergente(s)`);

  // 6) dentro da categoria, ordenado pelo número (a pilha sai na ordem da largada)
  const foraDeOrdem = dados.grupos.filter(g => {
    const nums = g.kits.map(k => k.numero).filter(n => n != null) as number[];
    return nums.some((n, i) => i > 0 && n < nums[i - 1]);
  });
  check("cada categoria em ordem de largada", foraDeOrdem.length === 0,
    foraDeOrdem.length ? foraDeOrdem.map(g => g.categoria).join(", ") : "todas ordenadas");

  // 7) extras da loja: os tamanhos do `sizes` são contados (o bug do `p.size`)
  const comExtras = dados.kits.filter(k => k.extrasTamanhos.length > 0);
  const exemplo = comExtras[0];
  check("extras da loja entram na conta", comExtras.length === 0 || !!exemplo?.extras,
    exemplo
      ? `#${exemplo.id} ${exemplo.pilotName}: "${exemplo.extras}" -> ${exemplo.extrasTamanhos.join(",")}`
      : "nenhuma inscrição com extras neste evento");

  // As camisetas do kit = piloto + navegador + extras, sem sobrar nem faltar
  const somaErrada = dados.kits.filter(k => {
    const esperado = (k.camisaPiloto ? 1 : 0) + (k.camisaNavegador ? 1 : 0) + k.extrasTamanhos.length;
    return k.todosTamanhos.length !== esperado;
  });
  check("camisetas por kit = piloto + nav + extras", somaErrada.length === 0,
    somaErrada.length ? somaErrada.map(k => `#${k.id}`).join(",") : `${dados.totalKits} kits conferidos`);

  // 8) QR: toda etiqueta precisa do accessHash pra ser bipada no check-in
  const semHash = dados.kits.filter(k => !k.accessHash);
  check("toda inscrição tem accessHash pro QR", semHash.length === 0,
    semHash.length ? `sem hash: ${semHash.map(k => `#${k.id}`).join(",")}` : "todas com hash");

  // 9) grade das etiquetas cabe na A4 nos três formatos
  for (const formato of ["10x15", "a6", "10x7"] as const) {
    const g = gradeDeEtiquetas(formato);
    const cabe = g.margemX >= 0 && g.margemY >= 0
      && g.margemX * 2 + g.colunas * g.larguraMm <= 210.01
      && g.margemY * 2 + g.linhas * g.alturaMm <= 297.01;
    const folhas = folhasDeEtiquetas(dados.totalKits, formato);
    check(`grade ${formato} cabe na A4`, cabe && g.porFolha > 0,
      `${g.colunas}x${g.linhas} = ${g.porFolha}/folha · ${dados.totalKits} kits = ${folhas} folha(s) · margens ${g.margemX.toFixed(1)}x${g.margemY.toFixed(1)}mm`);
  }

  // 10) telefones: o do piloto (`phone`) e o do navegador (`navigatorPhone`,
  // criado em 31/07). O do navegador nasce vazio para quem já estava inscrito.
  const comTelPiloto = dados.kits.filter(k => k.telefone).length;
  const comTelNav = dados.kits.filter(k => k.telefoneNavegador).length;
  const comNavegador = dados.kits.filter(k => k.navigatorName).length;
  check("telefone do navegador chega no kit",
    dados.kits.every(k => k.telefoneNavegador === null || typeof k.telefoneNavegador === "string"),
    `${comTelNav}/${comNavegador} inscrições com navegador têm o telefone dele`);

  // A máscara do formulário nunca pode virar o que vai pro banco
  check("máscara de telefone formata e limpa",
    formatarTelefone("11987654321") === "11 98765-4321"
    && somenteDigitos("11 98765-4321") === "11987654321"
    && formatarTelefone("123456789012", "11 98765-4321") === "11 98765-4321",
    `"11987654321" -> "${formatarTelefone("11987654321")}" (dígito a mais é recusado)`);

  console.log(`\nTelefone: piloto ${comTelPiloto}/${dados.totalKits} · navegador ${comTelNav}/${comNavegador}`);
  console.log(`Resumo: ${dados.totalKits} kits · ${dados.totalCamisetas} camisetas · ${dados.totalPendentes} pendente(s)`);
  console.log("Por tamanho: " + dados.totaisPorTamanho.map(t => `${t.size}=${t.total}`).join(" "));

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
