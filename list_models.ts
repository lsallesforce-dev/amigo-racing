import { ENV } from "./api/_server/env.js";

async function listModels() {
  const versions = ["v1", "v1beta"];
  for (const v of versions) {
    const url = `https://generativelanguage.googleapis.com/${v}/models?key=${ENV.geminiApiKey}`;
    console.log(`--- Listing models for ${v} ---`);
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.models) {
        data.models.forEach((m: any) => {
          console.log(`- ${m.name}`);
        });
      } else {
        console.log(`No models found or error: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`Error listing models for ${v}:`, e);
    }
  }
}

listModels();
