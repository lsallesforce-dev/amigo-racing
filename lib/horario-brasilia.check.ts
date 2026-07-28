// Prova que a data/hora da liberação fala horário de Brasília em qualquer ambiente.
// Roda com: npm run check:horario
//
// Roda a MESMA função com o processo em BRT e em UTC (o servidor da Vercel é UTC)
// e exige o mesmo resultado nos dois. Não toca no banco.
import {
  isoParaInputBrasilia,
  inputBrasiliaParaIso,
  formatarBrasilia,
} from "../shared/horarioBrasilia.js";

let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

const TZ_ORIGINAL = process.env.TZ;
function comFuso<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = TZ_ORIGINAL;
  }
}

// O organizador digita "01/08/2026 10:00" no campo de liberação.
const DIGITADO = "2026-08-01T10:00";
const ESPERADO_ISO = "2026-08-01T13:00:00.000Z"; // 10h de Brasília = 13h UTC
const ESPERADO_TEXTO = "01/08/2026 às 10:00";

for (const tz of ["America/Sao_Paulo", "UTC", "America/New_York", "Europe/Lisbon"]) {
  const iso = comFuso(tz, () => inputBrasiliaParaIso(DIGITADO));
  check(`[${tz}] digitado -> ISO`, iso === ESPERADO_ISO, `${iso}`);

  const volta = comFuso(tz, () => isoParaInputBrasilia(ESPERADO_ISO));
  check(`[${tz}] ISO -> campo`, volta === DIGITADO, `${volta}`);

  const texto = comFuso(tz, () => formatarBrasilia(ESPERADO_ISO));
  check(`[${tz}] ISO -> texto`, texto === ESPERADO_TEXTO, `"${texto}"`);
}

// Ida e volta em datas espalhadas pelo ano (pega qualquer surpresa de virada).
for (const valor of ["2026-01-15T00:00", "2026-06-30T23:59", "2026-12-25T12:30", "2026-02-28T07:05"]) {
  const iso = inputBrasiliaParaIso(valor);
  const volta = isoParaInputBrasilia(iso);
  check(`ida e volta ${valor}`, volta === valor, `${iso} -> ${volta}`);
}

// O gate compara instantes: 10h de Brasília ainda não chegou às 09:59 de Brasília.
const alvo = new Date(inputBrasiliaParaIso("2026-08-01T10:00")!).getTime();
const antes = new Date(inputBrasiliaParaIso("2026-08-01T09:59")!).getTime();
const depois = new Date(inputBrasiliaParaIso("2026-08-01T10:01")!).getTime();
check("gate: 09:59 ainda bloqueia", alvo > antes, `${alvo - antes}ms de folga`);
check("gate: 10:01 já libera", alvo < depois, `${depois - alvo}ms depois`);

// Entradas ruins não podem virar data maluca nem quebrar a tela.
check("vazio -> null", inputBrasiliaParaIso("") === null, "null");
check("lixo -> null", inputBrasiliaParaIso("banana") === null, "null");
check("null -> texto vazio", formatarBrasilia(null) === "", '""');

console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
