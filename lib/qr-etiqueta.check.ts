// Teste read-only do conteúdo do QR da etiqueta e da leitura no check-in.
// Roda com: npm run check:qr
//
// O QR carregava só o hash cru: a câmera do celular mostrava um punhado de
// letras e não abria nada. Aqui a gente prova que o que é impresso é a URL do
// passaporte e que o leitor consegue voltar dela pro hash.
import "dotenv/config";
import * as db from "../api/_server/db.js";
import { montarDadosDeKits, urlDoPassaporte } from "../shared/kits.js";
import { extrairHash } from "../pages/CheckIn.js";
import QRCode from "qrcode";
import jsQR from "jsqr";

const EVENT = 1;
const BASE = "https://amigo-racing.vercel.app";
let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

async function main() {
  const dados = montarDadosDeKits(
    await db.getRegistrationsByEventId(EVENT) as any[],
    await db.getCategoriesByEventId(EVENT) as any[],
    await db.getStartOrderConfigByEvent(EVENT) as any[]);

  const kit = dados.kits.find(k => k.accessHash)!;
  const url = urlDoPassaporte(BASE, kit.accessHash!);

  // 1) o que vai impresso é uma URL de verdade
  check("QR carrega a URL do passaporte", url.startsWith("https://") && url.includes("/passport/"), url);

  // 2) o leitor volta da URL pro hash
  check("leitor extrai o hash da URL", extrairHash(url) === kit.accessHash,
    `${extrairHash(url)} == ${kit.accessHash}`);

  // 3) etiqueta antiga (hash cru) e passaporte do competidor continuam lendo
  check("leitor ainda aceita o hash cru", extrairHash(kit.accessHash!) === kit.accessHash, "compatível");

  // 4) barra sobrando na base não gera URL com //
  const comBarra = urlDoPassaporte(`${BASE}//`, kit.accessHash!);
  check("base com barra no fim não duplica", !comBarra.includes("//passport"), comBarra);

  // 5) QR que não é de inscrição é recusado (não vira lookup no banco)
  check("QR estranho é recusado", extrairHash("https://google.com") === null, "null");
  check("texto vazio é recusado", extrairHash("") === null, "null");

  // 6) o hash lido existe mesmo e devolve a inscrição certa
  const achado = await db.getRegistrationByAccessHash(extrairHash(url)!) as any;
  check("hash do QR resolve a inscrição no banco", achado?.id === kit.id,
    `#${achado?.id} ${achado?.pilotName} (esperado #${kit.id})`);

  // 7) LEITURA DE VERDADE: gera a mesma matriz que vai impressa, desenha os
  // pixels e joga num leitor de QR (jsQR, mesma família do html5-qrcode que a
  // tela de check-in usa). Prova que o que sai da etiqueta volta como a URL.
  const matriz = QRCode.create(url, { errorCorrectionLevel: "M" });
  const modulos = matriz.modules.size;
  const PIXEL = 8;              // ~8px por módulo: o que uma câmera enxerga de perto
  const QUIET = 4 * PIXEL;      // margem branca exigida pelo padrão
  const lado = modulos * PIXEL + QUIET * 2;
  const pixels = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let l = 0; l < modulos; l++) {
    for (let c = 0; c < modulos; c++) {
      if (!matriz.modules.data[l * modulos + c]) continue;
      for (let dy = 0; dy < PIXEL; dy++) {
        for (let dx = 0; dx < PIXEL; dx++) {
          const px = ((QUIET + l * PIXEL + dy) * lado + (QUIET + c * PIXEL + dx)) * 4;
          pixels[px] = pixels[px + 1] = pixels[px + 2] = 0;
        }
      }
    }
  }
  const lido = jsQR(pixels, lado, lado);
  check("leitor de QR devolve a URL do passaporte", lido?.data === url,
    `${modulos}x${modulos} módulos -> "${lido?.data ?? "não leu"}"`);
  check("hash do QR lido bate com a inscrição", extrairHash(lido?.data || "") === kit.accessHash,
    `${extrairHash(lido?.data || "")}`);

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
