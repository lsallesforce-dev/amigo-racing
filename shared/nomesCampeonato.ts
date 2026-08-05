// Nomes de competidor no campeonato.
//
// O competidor do campeonato é uma STRING (não tem FK para inscrição): cada
// planilha de etapa traz o nome como o organizador digitou. Resultado prático:
// "Nilson Soares" na etapa 1 e "Nilson Soares de Lima" na etapa 2 viram DUAS
// pessoas na classificação, cada uma com metade dos pontos.
//
// Este arquivo não decide nada sozinho — ele SUGERE. Quem confirma a unificação
// é o organizador, na tela do unificador de competidores.

/** Sem acento, sem pontuação, espaços colapsados, minúsculo. */
export function normalizarNome(nome: string | null | undefined): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dois nomes que só diferem em acento/caixa/espaço são o mesmo nome. */
export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNome(a);
  return na !== "" && na === normalizarNome(b);
}

/**
 * Distância de Levenshtein (nº mínimo de edições de uma string para a outra).
 * Implementação em duas linhas de matriz — as listas aqui têm dezenas de nomes,
 * mas a comparação é O(n²) em pares, então cada par precisa ser barato.
 */
export function distanciaEdicao(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = new Array(b.length + 1);
  let atual = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) anterior[j] = j;

  for (let i = 1; i <= a.length; i++) {
    atual[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const custo = ca === b.charCodeAt(j - 1) ? 0 : 1;
      atual[j] = Math.min(
        atual[j - 1] + 1,      // inserção
        anterior[j] + 1,       // remoção
        anterior[j - 1] + custo, // substituição
      );
    }
    const troca = anterior;
    anterior = atual;
    atual = troca;
  }
  return anterior[b.length];
}

/** 1 = idênticos, 0 = nada a ver. Já normaliza os dois lados. */
export function semelhancaNomes(a: string, b: string): number {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maior = Math.max(na.length, nb.length);
  return 1 - distanciaEdicao(na, nb) / maior;
}

/**
 * "Nilson Soares" está contido em "Nilson Soares de Lima": todas as palavras do
 * nome curto aparecem, na mesma ordem, no nome longo. É o caso mais comum na
 * prática (o organizador digita o nome completo numa etapa e o apelido na outra).
 * Exige pelo menos 2 palavras em comum para não casar "Paulo" com qualquer Paulo.
 */
export function nomeContido(curto: string, longo: string): boolean {
  const a = normalizarNome(curto).split(" ").filter(Boolean);
  const b = normalizarNome(longo).split(" ").filter(Boolean);
  if (a.length < 2 || a.length > b.length) return false;

  let i = 0;
  for (const palavra of b) {
    if (palavra === a[i]) i++;
    if (i === a.length) return true;
  }
  return false;
}

export interface GrupoUnificacao {
  /** Nome sugerido como o "certo" — o mais frequente; empate resolve pelo mais completo. */
  canonico: string;
  /** Todos os nomes do grupo (inclui o canônico), do mais frequente para o menos. */
  nomes: string[];
  /** Quantas vezes cada nome apareceu na lista de entrada. */
  ocorrencias: Record<string, number>;
  /** Menor semelhança entre o canônico e os demais — quanto menor, mais suspeita a sugestão. */
  semelhancaMinima: number;
}

export interface OpcoesUnificacao {
  /** Semelhança mínima para juntar dois nomes. Padrão 0.85 (bem conservador). */
  limiar?: number;
}

/**
 * Agrupa nomes provavelmente iguais. Junta por semelhança de edição OU por
 * contenção de palavras, e propaga por transitividade (union-find simples):
 * se A ~ B e B ~ C, os três caem no mesmo grupo.
 *
 * Devolve só os grupos com 2 nomes distintos ou mais — nome sem irmão não é
 * sugestão nenhuma.
 */
export function sugerirUnificacoes(nomes: string[], opcoes: OpcoesUnificacao = {}): GrupoUnificacao[] {
  const limiar = opcoes.limiar ?? 0.85;

  const ocorrencias = new Map<string, number>();
  for (const cru of nomes || []) {
    const nome = String(cru ?? "").replace(/\s+/g, " ").trim();
    if (!nome || !normalizarNome(nome)) continue;
    ocorrencias.set(nome, (ocorrencias.get(nome) || 0) + 1);
  }

  const distintos = [...ocorrencias.keys()];
  const pai = distintos.map((_, i) => i);
  const acharRaiz = (i: number): number => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i]];
      i = pai[i];
    }
    return i;
  };
  const unir = (i: number, j: number) => {
    const ri = acharRaiz(i);
    const rj = acharRaiz(j);
    if (ri !== rj) pai[Math.max(ri, rj)] = Math.min(ri, rj);
  };

  for (let i = 0; i < distintos.length; i++) {
    for (let j = i + 1; j < distintos.length; j++) {
      const a = distintos[i];
      const b = distintos[j];
      const parecido =
        semelhancaNomes(a, b) >= limiar ||
        nomeContido(a, b) ||
        nomeContido(b, a);
      if (parecido) unir(i, j);
    }
  }

  const porRaiz = new Map<number, string[]>();
  distintos.forEach((nome, i) => {
    const raiz = acharRaiz(i);
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz)!.push(nome);
  });

  const grupos: GrupoUnificacao[] = [];
  for (const membros of porRaiz.values()) {
    if (membros.length < 2) continue;

    // Mais frequente vence; empate vai para o nome mais completo; depois alfabético.
    const ordenados = [...membros].sort((a, b) =>
      (ocorrencias.get(b)! - ocorrencias.get(a)!) ||
      (b.length - a.length) ||
      a.localeCompare(b, "pt-BR"),
    );
    const canonico = ordenados[0];
    const semelhancaMinima = ordenados
      .slice(1)
      .reduce((menor, n) => Math.min(menor, semelhancaSegura(canonico, n)), 1);

    grupos.push({
      canonico,
      nomes: ordenados,
      ocorrencias: Object.fromEntries(ordenados.map(n => [n, ocorrencias.get(n)!])),
      semelhancaMinima,
    });
  }

  // Grupo maior primeiro; empate pelo canônico, para a lista nunca dançar na tela.
  return grupos.sort((a, b) => b.nomes.length - a.nomes.length || a.canonico.localeCompare(b.canonico, "pt-BR"));
}

function semelhancaSegura(a: string, b: string): number {
  const s = semelhancaNomes(a, b);
  return Number.isFinite(s) ? s : 0;
}

// ------------------------------------------------- conciliação na importação
//
// O unificador acima conserta o estrago DEPOIS. Isto aqui evita o estrago: ao
// subir a 2ª planilha, os nomes do arquivo novo são comparados com os que já
// existem no campeonato e o wizard pergunta sobre os parecidos ANTES de gravar.
//
// A decisão do organizador tem que ser LEMBRADA (championship_name_aliases):
// "sim, é o mesmo" grava o apelido -> nome canônico; "não, são pessoas
// diferentes" grava isDistinct=true. Nos dois casos, a 3ª planilha não repergunta.

/** Uma decisão já tomada. `aliasNorm` é o nome JÁ normalizado (chave de busca). */
export type DecisaoAlias = { aliasNorm: string; canonicalName: string; isDistinct: boolean };

export type MotivoAutomatico = "exato" | "normalizado" | "alias";

export type PapelCompetidor = "pilot" | "navigator";

/**
 * O e-mail de um nome NUM PAPEL.
 *
 * ⚠️ Na coluna EMAIL das planilhas o endereço fica na linha do PILOTO e é o
 * contato da DUPLA, não da pessoa: no Ida, "Zé do Café" (piloto) traz
 * `vadoferrari@icloud.com`, que é do "Vado" (navegador dele). Logo o e-mail
 * identifica dupla + posição — só vale escopado por papel (piloto casa com
 * piloto) e SEMPRE como sugestão que o humano confirma. Casar automático por
 * e-mail ligaria pessoas erradas.
 */
export type DicaEmail = { nome: string; emailNorm: string; papel: PapelCompetidor };

/** trim + lowercase. E-mail vazio nunca casa com e-mail vazio. */
export function normalizarEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export interface EntradaConciliacao {
  /** Nomes vindos da planilha sendo importada. */
  novos: string[];
  /** Nomes já gravados no campeonato. */
  existentes: string[];
  /** Decisões de importações anteriores. */
  decisoes?: DecisaoAlias[];
  /** E-mails vindos da planilha sendo importada (opcional, retrocompatível). */
  dicasNovos?: DicaEmail[];
  /** E-mails já conhecidos do campeonato (opcional, retrocompatível). */
  dicasExistentes?: DicaEmail[];
  /** Semelhança mínima para virar dúvida. Padrão 0.82. */
  limiar?: number;
}

export interface SaidaConciliacao {
  /** Resolvidos sozinhos — nem chegam a virar popup. */
  automaticos: { novo: string; canonico: string; motivo: MotivoAutomatico }[];
  /**
   * O popup: "esse nome é o mesmo que esse?" — candidatos do mais parecido para
   * o menos, com os do MESMO E-MAIL sempre na frente.
   */
  duvidas: {
    novo: string;
    /** Papel do nome novo, quando a planilha deixou claro; null se veio nos dois papéis (ou em nenhum). */
    papel: PapelCompetidor | null;
    candidatos: { nome: string; similaridade: number; mesmoEmail: boolean }[];
  }[];
  /** Ninguém parecido: entra como competidor novo. */
  ineditos: string[];
}

/** Nome com 3 letras ou menos ("Gio", "Zé") casa com qualquer coisa — não vira dúvida. */
const MIN_CARACTERES_PARA_DUVIDA = 4;
/** Máximo de sugestões por dúvida: mais que isso vira ruído na tela. */
const MAX_CANDIDATOS = 3;

/**
 * Semelhança para efeito de conciliação. É a distância de edição, com dois
 * pisos que a distância sozinha não enxerga:
 *
 *  - nome curto contido no completo ("Nilson Soares" -> "Nilson Soares de Lima"):
 *    a distância dá ~0.62 e o par escaparia, então vale 0.92.
 *  - primeiro nome igual ou quase ("Marcos" x "Marcos Magri", "Rogeriao" x
 *    "Rogério Flávio Paggioro"): vale 0.84, o bastante para virar PERGUNTA.
 *
 * Isto NUNCA resolve sozinho — só decide o que merece popup. Apelido de verdade
 * ("Benê" = "Benedito Lopes") continua fora, e é para isso que existe o botão.
 */
export function similaridadeConciliacao(a: string, b: string): number {
  const base = semelhancaSegura(a, b);
  if (base === 1) return 1;

  if (nomeContido(a, b) || nomeContido(b, a)) return Math.max(base, 0.92);

  const pa = normalizarNome(a).split(" ").filter(Boolean);
  const pb = normalizarNome(b).split(" ").filter(Boolean);
  if (pa.length && pb.length && (pa.length > 1 || pb.length > 1)) {
    const primeiro = semelhancaSegura(pa[0], pb[0]);
    if (pa[0].length >= 4 && pb[0].length >= 4 && primeiro >= 0.85) return Math.max(base, 0.84);
  }

  return base;
}

/**
 * Conciliação dos nomes de UMA planilha contra o que o campeonato já tem.
 *
 * A comparação de TEXTO não sabe de papel — quem chama passa as listas já
 * separadas quando isso importar. Já a dica de E-MAIL é obrigatoriamente
 * escopada por papel: o mesmo endereço num piloto e num navegador é o contato
 * da dupla, não a mesma pessoa, e casar isso ligaria gente errada.
 *
 * O e-mail NUNCA promove para `automaticos` — ele só coloca o candidato na
 * frente da fila da pergunta (`mesmoEmail: true`). É o que finalmente liga
 * "Benê" -> "Benedito Lopes" e "Victinho" -> "Victor Hugo Pizoni Neto", que a
 * heurística de texto jamais pegaria.
 */
export function conciliarNomes(entrada: EntradaConciliacao): SaidaConciliacao {
  const limiar = entrada.limiar ?? 0.82;

  const limpar = (lista: string[]) => {
    const vistos = new Set<string>();
    const saida: string[] = [];
    for (const cru of lista || []) {
      const nome = String(cru ?? "").replace(/\s+/g, " ").trim();
      if (!nome || !normalizarNome(nome) || vistos.has(nome)) continue;
      vistos.add(nome);
      saida.push(nome);
    }
    return saida;
  };

  const novos = limpar(entrada.novos);
  const existentes = limpar(entrada.existentes);
  const decisoes = entrada.decisoes || [];

  const existentePorNome = new Set(existentes);
  const existentePorNorm = new Map<string, string>();
  for (const e of existentes) {
    const norm = normalizarNome(e);
    if (!existentePorNorm.has(norm)) existentePorNorm.set(norm, e);
  }

  // ---- índices de e-mail, sempre por (emailNorm | papel)
  const chaveEmail = (emailNorm: string, papel: PapelCompetidor) => `${emailNorm}|${papel}`;

  /** (email|papel) -> nomes EXISTENTES com esse e-mail nesse papel. */
  const existentesPorEmail = new Map<string, string[]>();
  for (const d of entrada.dicasExistentes || []) {
    const email = normalizarEmail(d?.emailNorm);
    const nome = String(d?.nome ?? "").replace(/\s+/g, " ").trim();
    if (!email || !nome || (d.papel !== "pilot" && d.papel !== "navigator")) continue;
    const k = chaveEmail(email, d.papel);
    if (!existentesPorEmail.has(k)) existentesPorEmail.set(k, []);
    if (!existentesPorEmail.get(k)!.includes(nome)) existentesPorEmail.get(k)!.push(nome);
  }

  /** nome NOVO -> os (email, papel) que a planilha trouxe para ele. */
  const emailsDoNovo = new Map<string, { emailNorm: string; papel: PapelCompetidor }[]>();
  /** nome NOVO -> papéis em que ele apareceu (para o campo `papel` da dúvida). */
  const papeisDoNovo = new Map<string, Set<PapelCompetidor>>();
  for (const d of entrada.dicasNovos || []) {
    const nome = String(d?.nome ?? "").replace(/\s+/g, " ").trim();
    if (!nome || (d.papel !== "pilot" && d.papel !== "navigator")) continue;
    if (!papeisDoNovo.has(nome)) papeisDoNovo.set(nome, new Set());
    papeisDoNovo.get(nome)!.add(d.papel);

    const email = normalizarEmail(d?.emailNorm);
    if (!email) continue; // e-mail vazio nunca casa com e-mail vazio
    if (!emailsDoNovo.has(nome)) emailsDoNovo.set(nome, []);
    const lista = emailsDoNovo.get(nome)!;
    if (!lista.some(x => x.emailNorm === email && x.papel === d.papel)) lista.push({ emailNorm: email, papel: d.papel });
  }

  const papelDoNovo = (nome: string): PapelCompetidor | null => {
    const papeis = papeisDoNovo.get(nome);
    if (!papeis || papeis.size !== 1) return null;
    return [...papeis][0];
  };

  const automaticos: SaidaConciliacao["automaticos"] = [];
  const duvidas: SaidaConciliacao["duvidas"] = [];
  const ineditos: string[] = [];

  for (const novo of novos) {
    const norm = normalizarNome(novo);
    const minhasDecisoes = decisoes.filter(d => d.aliasNorm === norm);

    // 1) Decisão gravada "é o mesmo": aplica calado. Vem antes do match exato
    //    porque é escolha humana explícita — manda em qualquer heurística.
    const alias = minhasDecisoes.find(d => !d.isDistinct);
    if (alias) {
      automaticos.push({ novo, canonico: alias.canonicalName, motivo: "alias" });
      continue;
    }

    // 2) Mesmo string: é a mesma pessoa, ponto.
    if (existentePorNome.has(novo)) {
      automaticos.push({ novo, canonico: novo, motivo: "exato" });
      continue;
    }

    // 3) Só muda acento/caixa/espaço ("Rogeriao" x "Rogerião"): resolve sozinho.
    const porNorm = existentePorNorm.get(norm);
    if (porNorm) {
      automaticos.push({ novo, canonico: porNorm, motivo: "normalizado" });
      continue;
    }

    // 4) Parecidos viram pergunta — menos os pares que o organizador já disse
    //    que são pessoas DIFERENTES.
    const recusados = new Set(minhasDecisoes.filter(d => d.isDistinct).map(d => d.canonicalName));

    // 4a) Mesmo e-mail no MESMO papel: entra na frente, mesmo com semelhança de
    //     texto baixa, e mesmo que o nome seja curto demais para a heurística.
    //     Papéis diferentes NÃO geram dica: lá o e-mail é da dupla, não da pessoa.
    const porEmail: string[] = [];
    for (const { emailNorm, papel } of emailsDoNovo.get(novo) || []) {
      for (const candidato of existentesPorEmail.get(chaveEmail(emailNorm, papel)) || []) {
        if (candidato === novo || recusados.has(candidato) || porEmail.includes(candidato)) continue;
        if (!existentePorNome.has(candidato)) continue; // só sugere quem de fato existe
        porEmail.push(candidato);
      }
    }
    const daDica = new Set(porEmail);

    // 4b) Os parecidos de texto de sempre, atrás dos do e-mail.
    const porTexto = norm.length >= MIN_CARACTERES_PARA_DUVIDA
      ? existentes
        .filter(e => !recusados.has(e) && !daDica.has(e))
        .map(nome => ({ nome, similaridade: similaridadeConciliacao(novo, nome) }))
        .filter(c => c.similaridade >= limiar)
        .sort((a, b) => b.similaridade - a.similaridade || a.nome.localeCompare(b.nome, "pt-BR"))
      : [];

    const candidatos = [
      ...porEmail.map(nome => ({ nome, similaridade: similaridadeConciliacao(novo, nome), mesmoEmail: true })),
      ...porTexto.map(c => ({ ...c, mesmoEmail: false })),
    ].slice(0, MAX_CANDIDATOS);

    if (candidatos.length > 0) {
      duvidas.push({ novo, papel: papelDoNovo(novo), candidatos });
      continue;
    }

    ineditos.push(novo);
  }

  return { automaticos, duvidas, ineditos };
}

