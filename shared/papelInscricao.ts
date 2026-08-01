// Quem é você nesta inscrição — fonte única, usada pela listagem do painel do
// competidor, pelos gates do backend e pela tela.
//
// A inscrição tem UM dono (registrations.userId), mas a dupla é de dois: quem
// baixa a planilha de navegação costuma ser o NAVEGADOR, que tem login próprio.
// O vínculo do navegador é por e-mail: registrations.navigatorEmail casando com
// a conta logada.
//
// O casamento é sempre contra users.openId, que é o e-mail normalizado e é
// UNIQUE no schema (ver normalizeEmail em api/_server/oauth.ts). users.email
// não é único nem garantidamente normalizado — não serve de chave.

export type PapelInscricao = "admin" | "titular" | "organizador" | "navegador" | null;

export type AcaoInscricao = "ver" | "planilha" | "pagar" | "editar" | "cancelar";

/** Mesma regra do normalizeEmail do oauth.ts. Vazio vira null. */
export function normalizarEmail(valor: unknown): string | null {
  const s = String(valor ?? "").trim().toLowerCase();
  return s ? s : null;
}

const PERMISSOES: Record<Exclude<PapelInscricao, null>, Record<AcaoInscricao, boolean>> = {
  admin: { ver: true, planilha: true, pagar: true, editar: true, cancelar: true },
  organizador: { ver: true, planilha: true, pagar: true, editar: true, cancelar: true },
  titular: { ver: true, planilha: true, pagar: true, editar: true, cancelar: true },
  // O navegador acompanha e resolve o que é dele (planilha, pagamento), mas os
  // dados da inscrição são editados por quem inscreveu — dois editando o mesmo
  // registro na véspera é pedir confusão.
  navegador: { ver: true, planilha: true, pagar: true, editar: false, cancelar: false },
};

export function pode(papel: PapelInscricao, acao: AcaoInscricao): boolean {
  if (!papel) return false;
  return PERMISSOES[papel][acao];
}

/**
 * `ehOrganizadorDoEvento` entra pronto porque a checagem real precisa de I/O
 * (getOrganizerContext) e este módulo é puro — quem já resolveu isso passa o
 * booleano, o resto passa false.
 */
export function papelNaInscricao(args: {
  reg: { userId?: number | string | null; navigatorEmail?: string | null } | null | undefined;
  user: { id?: number | string; openId?: string | null; role?: string | null } | null | undefined;
  ehOrganizadorDoEvento?: boolean;
}): PapelInscricao {
  const { reg, user } = args;
  if (!reg || !user) return null;

  if (user.role === "admin") return "admin";
  if (reg.userId != null && user.id != null && Number(reg.userId) === Number(user.id)) {
    return "titular";
  }
  if (args.ehOrganizadorDoEvento) return "organizador";

  const daInscricao = normalizarEmail(reg.navigatorEmail);
  const daConta = normalizarEmail(user.openId);
  // Os dois precisam existir: sem isso, inscrição sem navegador casaria com
  // conta sem openId e a lista vazaria pra todo mundo.
  if (daInscricao && daConta && daInscricao === daConta) return "navegador";

  return null;
}

/** Campos que o navegador não recebe. Ver redigirParaNavegador(). */
const CAMPOS_REDIGIDOS = [
  "pilotCpf",
  "pilotEmail",
  "pilotPhone",
  "navigatorCPF",
  "navigatorCpf",
  "transactionId",
] as const;

/**
 * O vínculo é automático por e-mail, então um e-mail digitado errado entrega a
 * inscrição a um estranho. Ele não edita nem cancela, e também não leva
 * documento nem contato pessoal: só o operacional (nome do piloto, evento,
 * categoria, largada, status, planilhas).
 */
export function redigirParaNavegador<T extends Record<string, any>>(reg: T): T {
  const copia: Record<string, any> = { ...reg };
  for (const campo of CAMPOS_REDIGIDOS) {
    if (campo in copia) copia[campo] = null;
  }
  return copia as T;
}

/** Mensagem para o navegador que tentou uma ação que não é dele. */
export function mensagemSemPermissao(acao: "editar" | "cancelar"): string {
  return acao === "editar"
    ? "Como navegador você pode ver a inscrição, baixar a planilha e pagar, mas só o piloto que fez a inscrição pode editar os dados."
    : "Só o piloto que fez a inscrição pode pedir o cancelamento. Fale com ele para solicitar.";
}
