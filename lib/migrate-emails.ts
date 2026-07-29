// Aplica lib/migrations/2026-07-29-event-emails.sql no banco do DATABASE_URL.
// Roda com: npm run migrate:emails
//
// ⚠️ O .env local aponta pro banco de PRODUÇÃO. O script é idempotente
// (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) e não altera dado
// existente, mas confira o host que ele imprime antes de confirmar.
import "dotenv/config";
import fs from "fs";
import path from "path";
import postgres from "postgres";

const ARQUIVO = path.join(process.cwd(), "lib/migrations/2026-07-29-event-emails.sql");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");

  console.log("[migrate] banco:", url.split("@")[1]?.split("?")[0] || "desconhecido");
  const sql = postgres(url, { ssl: "require", max: 1 });

  try {
    await sql.unsafe(fs.readFileSync(ARQUIVO, "utf8"));
    console.log("[migrate] SQL aplicado");

    const tabelas = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('event_emails','event_email_recipients')
      order by table_name`;
    const colunas = await sql`
      select column_name from information_schema.columns
      where table_name = 'events' and column_name like 'autoCharge%'
      order by column_name`;

    console.log("[migrate] tabelas:", tabelas.map(t => t.table_name).join(", ") || "(nenhuma)");
    console.log("[migrate] colunas em events:", colunas.map(c => c.column_name).join(", ") || "(nenhuma)");

    const ok = tabelas.length === 2 && colunas.length === 3;
    console.log(ok ? "[migrate] OK" : "[migrate] FALTOU ALGO");
    process.exit(ok ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error("[migrate] erro:", err.message);
  process.exit(1);
});
