import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

let connectionString = rawConnectionString;
try {
  const url = new URL(rawConnectionString);
  if (url.searchParams.has("pgbouncer")) {
    url.searchParams.delete("pgbouncer");
    connectionString = url.toString();
  }
} catch (e) {
  connectionString = rawConnectionString.replace(/[\?&]pgbouncer=true/g, "");
}

export default defineConfig({
  schema: "./api/_server/schema.ts",
  out: "./api/_server/_drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
