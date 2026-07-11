// Fonte única de verdade pra tamanhos de camiseta. Usado no backend (export,
// estoque, validação) e no frontend (formulário de inscrição, gestão de estoque).
//
// Os dados vêm de dois "sistemas" diferentes:
//  - Kit (piloto/navegador): salvo minúsculo (pp, p, m, g, gg, g1..g4, infantil)
//  - Extras da loja (purchasedProducts): rótulos livres (P, G, M, Inf 2, Inf 6...)
// normalizeShirtSize() unifica tudo num token canônico maiúsculo, junta G3/G4
// (o estoque foi pedido combinado) e tira espaços dos infantis (INF 6 -> INF6).

export function normalizeShirtSize(raw: unknown): string {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  if (s === "G3" || s === "G4") return "G3/G4";
  return s;
}

// Ordem de exibição: PP, P, M, G, GG, G1..G4 -> infantis -> outros.
const ORDER = ["PP", "P", "M", "G", "GG", "G1", "G2", "G3/G4", "G3", "G4"];

export function shirtSizeSortKey(size: string): [number, number, number | string] {
  const idx = ORDER.indexOf(size);
  if (idx >= 0) return [0, idx, 0];
  if (size === "INFANTIL") return [1, 0, 0];
  const m = size.match(/^INF(\d+)/);
  if (m) return [1, 1, Number(m[1])];
  return [2, 0, size];
}

export function sortShirtSizes<T>(items: T[], getSize: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ka = shirtSizeSortKey(getSize(a));
    const kb = shirtSizeSortKey(getSize(b));
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    if (typeof ka[2] === "number" && typeof kb[2] === "number") return ka[2] - kb[2];
    return String(ka[2]).localeCompare(String(kb[2]));
  });
}

// Extrai todos os tamanhos de camiseta consumidos por UMA inscrição
// (piloto + navegador + extras da loja), já normalizados. Repete o tamanho
// uma vez por camiseta (ex: 2 extras M -> ["M","M"]).
export function shirtSizesOfRegistration(reg: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { const k = normalizeShirtSize(v); if (k) out.push(k); };

  push(reg?.pilotShirtSize);
  if (reg?.navigatorShirtSize) push(reg.navigatorShirtSize);

  let pp: any[] = [];
  try {
    pp = typeof reg?.purchasedProducts === "string"
      ? JSON.parse(reg.purchasedProducts)
      : (reg?.purchasedProducts || []);
  } catch { pp = []; }
  if (Array.isArray(pp)) {
    for (const item of pp) {
      if (item && Array.isArray(item.sizes)) {
        for (const sz of item.sizes) push(sz);
      }
    }
  }
  return out;
}
