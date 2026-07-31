// Máscara de telefone dos formulários. Estava escrita inline dentro do
// onChange do telefone do piloto; com o campo do navegador viraria a segunda
// cópia da mesma expressão regular.

/** "11987654321" -> "11 98765-4321". Devolve o anterior se passar de 11 dígitos. */
export function formatarTelefone(valor: string, anterior = ""): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length > 11) return anterior;
  return digitos.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, p1, p2) => {
    let out = ddd;
    if (p1) out += ` ${p1}`;
    if (p2) out += `-${p2}`;
    return out;
  });
}

/** Só os dígitos, que é o formato gravado no banco. */
export function somenteDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}
