// Envelope único dos e-mails do Amigo Racing.
//
// O HTML estava duplicado inline em cada disparo (nova inscrição, pagamento
// confirmado, convite de membro, reset de senha), cada um com a sua variação de
// cor e rodapé. Agora todos entram no mesmo envelope e o corpo é a única parte
// que muda.
//
// E-mail não tem CSS externo nem flexbox confiável: tudo aqui é style inline e
// tabela, que é o que os clientes de e-mail realmente renderizam.

const LARANJA = "#ea580c";
const TEXTO = "#333333";
const CINZA = "#999999";

/** Escapa texto que veio do usuário antes de entrar no HTML do e-mail. */
export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * URL de imagem pronta pra entrar num <img src> de e-mail.
 *
 * Duas armadilhas:
 * - ESPAÇO na URL (nome de arquivo tipo "WhatsApp Image 2026-07-11 at 17.51.48.jpeg")
 *   quebra o atributo e o proxy de imagem do Gmail não busca. encodeURI resolve,
 *   e não re-escapa o que já estiver codificado (ele não mexe em "%").
 * - data: URI não é renderizado por Gmail/Outlook — melhor não exibir imagem
 *   nenhuma do que exibir o ícone de quebrado.
 *
 * Devolve null quando não dá pra usar.
 */
export function urlDeImagemParaEmail(url?: string | null): string | null {
  const bruta = String(url || "").trim();
  if (!bruta) return null;
  if (!/^https?:\/\//i.test(bruta)) return null; // data:, blob:, caminho relativo
  try {
    return encodeURI(bruta);
  } catch {
    return null;
  }
}

export interface EmailLayoutOpts {
  /** Conteúdo já em HTML (parágrafos, listas). */
  bodyHtml: string;
  /** Título grande no topo do card. */
  titulo?: string;
  /** Logo do evento (URL pública). Sem ela, só o nome do evento. */
  logoUrl?: string | null;
  /** Nome do evento, no cabeçalho. */
  eventName?: string | null;
  /** Botão de ação no fim do corpo. */
  cta?: { label: string; url: string } | null;
  /** Linha extra no rodapé (ex.: por que a pessoa recebeu). */
  rodapeExtra?: string | null;
}

export function renderEmail(opts: EmailLayoutOpts): string {
  const { bodyHtml, titulo, logoUrl, eventName, cta, rodapeExtra } = opts;

  // Logo inutilizável (data:, caminho relativo) cai no nome do evento em texto —
  // melhor que o ícone de imagem quebrada.
  const logoSegura = urlDeImagemParaEmail(logoUrl);
  const nomeEmTexto = eventName
    ? `<p style="margin:0 0 12px;text-align:center;font-size:14px;font-weight:bold;color:${LARANJA};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(eventName)}</p>`
    : "";

  const cabecalho = logoSegura
    ? `<img src="${escapeHtml(logoSegura)}" alt="${escapeHtml(eventName || "Evento")}" width="180" style="max-width:180px;max-height:80px;width:auto;height:auto;display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />`
    : nomeEmTexto;

  const botao = cta
    ? `<div style="text-align:center;margin:28px 0 8px;">
         <a href="${escapeHtml(cta.url)}" style="background-color:${LARANJA};color:#ffffff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">${escapeHtml(cta.label)}</a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:${TEXTO};">
        <tr><td>
          ${cabecalho}
          ${titulo ? `<h2 style="margin:0 0 16px;color:${LARANJA};font-size:20px;">${escapeHtml(titulo)}</h2>` : ""}
          <div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
          ${botao}
          <hr style="border:none;border-top:1px solid #eeeeee;margin:26px 0 14px;" />
          <p style="color:${CINZA};font-size:12px;text-align:center;margin:0;">🏁 Amigo Racing</p>
          ${rodapeExtra ? `<p style="color:${CINZA};font-size:11px;text-align:center;margin:6px 0 0;">${escapeHtml(rodapeExtra)}</p>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Texto digitado pelo organizador -> HTML seguro.
 * Escapa tudo (o campo é texto puro, não HTML) e transforma linha em <p>,
 * preservando os parágrafos que ele escreveu.
 */
export function textoParaHtml(texto: string): string {
  return String(texto || "")
    .split(/\n{2,}/)
    .map(bloco => `<p style="margin:0 0 12px;">${escapeHtml(bloco).replace(/\n/g, "<br />")}</p>`)
    .join("");
}
