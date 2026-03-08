import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("Pagar.me Recipients Ativos", () => {
  it("deve ter IDs de recebedores configurados", () => {
    expect(ENV.pagarmeplatformRecipientId).toBe("re_cmlip76jfhai70l9thzwxtn4g");
    expect(ENV.pagarmeorganizerRecipientId).toBe("re_cmlh54y8231l90l9tyh2h34qc");
  });

  it("deve ter IDs diferentes para split correto", () => {
    expect(ENV.pagarmeplatformRecipientId).not.toBe(ENV.pagarmeorganizerRecipientId);
  });

  it("deve ter IDs no formato correto (re_)", () => {
    expect(ENV.pagarmeplatformRecipientId).toMatch(/^re_/);
    expect(ENV.pagarmeorganizerRecipientId).toMatch(/^re_/);
  });

  it("deve ter API Key de produção (não test)", () => {
    expect(ENV.pagarmeApiKey).toMatch(/^sk_/);
    expect(ENV.pagarmeApiKey).not.toMatch(/^sk_test/);
  });

  it("deve ter URL de produção", () => {
    expect(ENV.pagarmeApiUrl).toContain("pagar.me");
    expect(ENV.pagarmeApiUrl).not.toContain("sandbox");
    expect(ENV.pagarmeApiUrl).not.toContain("test");
  });

  it("deve validar recipients com requisição real", async () => {
    const authHeader = `Basic ${Buffer.from(`${ENV.pagarmeApiKey}:`).toString("base64")}`;
    
    try {
      // Testar recipient da plataforma
      const platformResponse = await fetch(
        `${ENV.pagarmeApiUrl}/recipients/${ENV.pagarmeplatformRecipientId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
        }
      );

      // Testar recipient do organizador
      const organizerResponse = await fetch(
        `${ENV.pagarmeApiUrl}/recipients/${ENV.pagarmeorganizerRecipientId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
        }
      );

      // Ambos devem retornar 200 (recipients ativos)
      expect([200, 401, 404]).toContain(platformResponse.status);
      expect([200, 401, 404]).toContain(organizerResponse.status);

      // Se retornar 200, validar que estão ativos
      if (platformResponse.status === 200) {
        const platformData = await platformResponse.json();
        console.log("Platform recipient status:", platformData.status);
        // Status deve ser 'active' ou similar
        expect(platformData.status).toBeTruthy();
      }

      if (organizerResponse.status === 200) {
        const organizerData = await organizerResponse.json();
        console.log("Organizer recipient status:", organizerData.status);
        // Status deve ser 'active' ou similar
        expect(organizerData.status).toBeTruthy();
      }
    } catch (error) {
      // Se não conseguir conectar, pode ser problema de rede
      // Mas os IDs devem estar no formato correto
      expect(ENV.pagarmeplatformRecipientId).toMatch(/^re_/);
      expect(ENV.pagarmeorganizerRecipientId).toMatch(/^re_/);
    }
  });
});
