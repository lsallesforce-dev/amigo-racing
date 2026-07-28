// Fonte única de verdade pra liberação das planilhas de navegação (.nbp/.bin/.totem).
//
// Regra: o competidor só baixa se a inscrição estiver PAGA e a hora de liberação
// (releaseAt) já tiver chegado. Sem releaseAt = libera assim que o organizador salva.
//
// O gate é do BACKEND, não da tela: a URL do arquivo mora num bucket público, então
// quem recebe o link baixa. Por isso sanitizeNavigationFiles() nunca devolve `url`
// de arquivo bloqueado — esconder o botão no front não protegeria nada.

export interface NavigationFile {
  id?: string;
  name?: string;
  url?: string;
  type?: string;
  categoryId?: number | string | null;
  releaseAt?: string | null;
  uploadedAt?: string;
}

export type LockReason = "payment" | "schedule";

export interface SafeNavigationFile {
  id: string;
  name: string;
  type: string;
  categoryId: number | string | null;
  releaseAt: string | null;
  locked: boolean;
  lockReason: LockReason | null;
  url?: string; // só vem quando liberado
}

/** Identificador estável do arquivo. Planilha antiga (sem id) cai no índice do array. */
export function navigationFileId(file: NavigationFile, index: number): string {
  return file?.id ? String(file.id) : String(index);
}

/** Planilha sem categoria (ou "all") é geral: vale pra todo mundo do evento. */
export function isNavigationFileOfCategory(
  file: NavigationFile,
  categoryId: number | null | undefined
): boolean {
  const alvo = file?.categoryId;
  if (alvo === null || alvo === undefined || alvo === "all" || alvo === "") return true;
  return Number(alvo) === Number(categoryId);
}

/** true quando a hora de liberação ainda não chegou. */
export function isScheduledForLater(file: NavigationFile, now: Date = new Date()): boolean {
  if (!file?.releaseAt) return false;
  const quando = new Date(file.releaseAt);
  if (isNaN(quando.getTime())) return false; // data inválida não trava ninguém
  return quando.getTime() > now.getTime();
}

/**
 * Motivo do bloqueio, ou null se liberado.
 * Pagamento tem prioridade sobre agenda: quem não pagou vê "confirme o pagamento",
 * não a data da liberação.
 */
export function navigationLockReason(
  file: NavigationFile,
  registrationStatus: string | null | undefined,
  now: Date = new Date()
): LockReason | null {
  if (registrationStatus !== "paid") return "payment";
  if (isScheduledForLater(file, now)) return "schedule";
  return null;
}

/**
 * Versão do array que pode ir pro cliente: filtra por categoria, marca o bloqueio
 * e OMITE a url do que está bloqueado.
 *
 * `bypass` = organizador do evento / admin: enxerga e baixa tudo pra conseguir testar
 * antes da hora.
 */
export function sanitizeNavigationFiles(
  files: unknown,
  opts: {
    categoryId: number | null | undefined;
    registrationStatus: string | null | undefined;
    now?: Date;
    bypass?: boolean;
  }
): SafeNavigationFile[] {
  const lista = parseNavigationFiles(files);
  const now = opts.now || new Date();

  return lista
    .map((file, index) => ({ file, id: navigationFileId(file, index) }))
    .filter(({ file }) => isNavigationFileOfCategory(file, opts.categoryId))
    .map(({ file, id }) => {
      const motivo = opts.bypass ? null : navigationLockReason(file, opts.registrationStatus, now);
      const seguro: SafeNavigationFile = {
        id,
        name: String(file?.name || "Planilha"),
        type: String(file?.type || "bin"),
        categoryId: (file?.categoryId ?? null) as number | string | null,
        releaseAt: file?.releaseAt || null,
        locked: motivo !== null,
        lockReason: motivo,
      };
      if (!motivo && file?.url) seguro.url = file.url;
      return seguro;
    });
}

/** O campo vem como json (array) ou string, dependendo de onde foi lido. */
export function parseNavigationFiles(raw: unknown): NavigationFile[] {
  if (Array.isArray(raw)) return raw as NavigationFile[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
