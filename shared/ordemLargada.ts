// Saneamento da ordem de largada.
//
// `start_order_config.registrationOrder` é um array de ids de inscrição por
// categoria — o resultado do sorteio. Quando a categoria de uma inscrição muda,
// o id continuava no array da categoria ANTIGA e não entrava no da nova: o
// competidor aparecia duas vezes na lista de largada (uma em cada categoria) e
// os números da categoria antiga vinham inflados.
//
// Aqui a ordem é saneada em dois momentos: na escrita (quando a categoria muda)
// e na leitura (para a tela nunca mostrar um resíduo que já esteja no banco).

/** O array pode estar como json ou como string, dependendo de onde foi lido. */
export function parseOrdem(registrationOrder: unknown): number[] {
  if (Array.isArray(registrationOrder)) return registrationOrder.map(Number).filter(n => !isNaN(n));
  if (typeof registrationOrder === "string") {
    try {
      const parsed = JSON.parse(registrationOrder);
      return Array.isArray(parsed) ? parsed.map(Number).filter(n => !isNaN(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * A ordem que vale para a categoria: mantém o sorteio de quem é de fato dela,
 * descarta resíduo (inscrição que mudou de categoria, foi cancelada ou sumiu) e
 * põe no fim quem ainda não tinha posição — nunca no meio, para não empurrar o
 * número de quem já foi avisado.
 *
 * `idsDaCategoria` = ids das inscrições ATIVAS daquela categoria, hoje.
 */
export function sanearOrdem(registrationOrder: unknown, idsDaCategoria: number[]): number[] {
  const validos = new Set(idsDaCategoria.map(Number));
  const atual = parseOrdem(registrationOrder);

  const vistos = new Set<number>();
  const mantidos: number[] = [];
  for (const id of atual) {
    if (!validos.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    mantidos.push(id);
  }
  const faltantes = idsDaCategoria.map(Number).filter(id => !vistos.has(id));
  return [...mantidos, ...faltantes];
}

/** true quando a ordem salva difere da saneada — usado para saber se precisa gravar. */
export function ordemPrecisaDeConserto(registrationOrder: unknown, idsDaCategoria: number[]): boolean {
  const atual = parseOrdem(registrationOrder);
  const nova = sanearOrdem(registrationOrder, idsDaCategoria);
  return atual.length !== nova.length || atual.some((id, i) => id !== nova[i]);
}

/**
 * Tira uma inscrição da ordem de uma categoria (a antiga, quando ela muda) e
 * acrescenta na outra (a nova), no fim.
 */
export function moverEntreCategorias(
  registrationOrder: unknown,
  registrationId: number,
  acao: "remover" | "acrescentar",
): number[] {
  const atual = parseOrdem(registrationOrder).filter(id => id !== Number(registrationId));
  return acao === "acrescentar" ? [...atual, Number(registrationId)] : atual;
}
