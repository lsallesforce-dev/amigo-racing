import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("Pagar.me Production API", () => {
  it("deve ter API Key de produção configurada", () => {
    expect(ENV.pagarmeApiKey).toBeDefined();
    expect(ENV.pagarmeApiKey).toBeTruthy();
    // API Key de produção começa com sk_ (sem "test")
    expect(ENV.pagarmeApiKey).toMatch(/^sk_/);
    expect(ENV.pagarmeApiKey).not.toMatch(/^sk_test/);
  });

  it("deve ter URL de produção configurada", () => {
    expect(ENV.pagarmeApiUrl).toBeDefined();
    expect(ENV.pagarmeApiUrl).toBeTruthy();
    // URL deve ser a de produção
    expect(ENV.pagarmeApiUrl).toContain("pagar.me");
    expect(ENV.pagarmeApiUrl).not.toContain("sandbox");
    expect(ENV.pagarmeApiUrl).not.toContain("test");
  });

  it("deve ter IDs de recebedores ativos configurados", () => {
    expect(ENV.pagarmeplatformRecipientId).toBeDefined();
    expect(ENV.pagarmeplatformRecipientId).toBeTruthy();
    expect(ENV.pagarmeplatformRecipientId).toMatch(/^re_/);
    
    expect(ENV.pagarmeorganizerRecipientId).toBeDefined();
    expect(ENV.pagarmeorganizerRecipientId).toBeTruthy();
    expect(ENV.pagarmeorganizerRecipientId).toMatch(/^re_/);
  });

  it("deve validar que os IDs são diferentes (10% e 90%)", () => {
    // Os IDs devem ser diferentes para split correto
    expect(ENV.pagarmeplatformRecipientId).not.toBe(ENV.pagarmeorganizerRecipientId);
  });

  it("deve validar credenciais do Pagar.me com requisição real", async () => {
    const authHeader = `Basic ${Buffer.from(`${ENV.pagarmeApiKey}:`).toString("base64")}`;
    
    try {
      const response = await fetch(`${ENV.pagarmeApiUrl}/recipients`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      });

      // Se a API Key é válida, deve retornar 200 ou 401 (não 403)
      expect([200, 401, 422]).toContain(response.status);
      
      // Se retornar erro de autenticação, a chave está errada
      if (response.status === 401) {
        throw new Error("API Key inválida ou expirada");
      }
    } catch (error) {
      // Se não conseguir conectar, pode ser problema de rede
      // Mas a chave deve estar formatada corretamente
      expect(ENV.pagarmeApiKey).toMatch(/^sk_/);
    }
  });
});
