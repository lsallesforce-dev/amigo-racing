import fs from "fs";
import path from "path";
import { ENV } from "./env.js";
import postgres from "postgres";

const SQL = postgres(ENV.databaseUrl, { ssl: 'require' });

async function generateEmbedding(text: string) {
  const url = `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${ENV.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/embedding-001",
      content: { parts: [{ text }] },
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini status ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

async function run() {
  console.log("Starting ingestion...");
  const content = fs.readFileSync("base_conhecimento.md", "utf-8");
  const sections = content.split(/\n(?=##\s)/).filter(s => s.trim());
  console.log(`Chunks to process: ${sections.length}`);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    console.log(`Processing ${i+1}/${sections.length}...`);
    const embedding = await generateEmbedding(section);
    await SQL`
      INSERT INTO knowledge_chunks (content, embedding, metadata)
      VALUES (${section}, ${embedding}, ${JSON.stringify({ source: 'base.md', i })})
    `;
    console.log(`Saved ${i+1}`);
  }
  console.log("All done.");
  await SQL.end();
}

run().catch(e => { console.error(e); process.exit(1); });
