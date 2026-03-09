import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./api/drizzle/schema.ts",
  out: "./api/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
