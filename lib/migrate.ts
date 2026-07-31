// Aplica um arquivo .sql de lib/migrations no banco do DATABASE_URL.
//   npx tsx lib/migrate.ts lib/migrations/2026-07-30-edit-deadline.sql
//
// ⚠️ O .env local aponta pro banco de PRODUÇÃO. Os arquivos de migração deste
// projeto são idempotentes (IF NOT EXISTS), mas confira o host impresso.
import "dotenv/config";
import fs from "fs";
import path from "path";
import postgres from "postgres";

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) throw new Error("uso: tsx lib/migrate.ts <caminho do .sql>");

  const caminho = path.resolve(process.cwd(), arquivo);
  if (!fs.existsSync(caminho)) throw new Error(`arquivo não encontrado: ${caminho}`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");

  console.log("[migrate] banco :", url.split("@")[1]?.split("?")[0] || "desconhecido");
  console.log("[migrate] arquivo:", path.basename(caminho));

  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    await sql.unsafe(fs.readFileSync(caminho, "utf8"));
    console.log("[migrate] OK");
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error("[migrate] erro:", err.message);
  process.exit(1);
});
