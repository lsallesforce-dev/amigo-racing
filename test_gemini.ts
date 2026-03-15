import { ENV } from "./api/_server/env.js";

async function testEmbedding(apiVersion: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/${model}:embedContent?key=${ENV.geminiApiKey}`;
  console.log(`Testing URL: ${url}`);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        content: { parts: [{ text: "Hello world" }] },
      })
    });
    const status = response.status;
    const text = await response.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text.substring(0, 200)}...`);
    return status === 200;
  } catch (e) {
    console.error(`Error testing ${apiVersion} ${model}:`, e);
    return false;
  }
}

async function run() {
  const models = ["models/text-embedding-004", "models/embedding-001"];
  const versions = ["v1", "v1beta"];

  for (const model of models) {
    for (const v of versions) {
      console.log(`--- Testing ${model} with ${v} ---`);
      if (await testEmbedding(v, model)) {
        console.log(`SUCCESS found for ${model} with ${v}`);
      }
    }
  }
}

run();
