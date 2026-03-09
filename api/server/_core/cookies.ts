import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // Extrair o dominio do host da requisicao
  const host = req.get('host') || 'localhost';
  const hostOnly = host.split(':')[0]; // Remove a porta se existir

  // Se for localhost ou IP, nao usar domain (deixar undefined para usar o dominio atual)
  // Se for um dominio real, usar o dominio raiz com ponto na frente para subdomÃ­nios
  let domain: string | undefined;

  if (LOCAL_HOSTS.has(hostOnly) || isIpAddress(hostOnly)) {
    // Para localhost/IP, deixar undefined (usa o dominio atual)
    domain = undefined;
  } else if (hostOnly.endsWith('.amigoracing.com.br')) {
    // Se for um subdominio de amigoracing.com.br, usar o dominio raiz
    domain = '.amigoracing.com.br';
  } else {
    // Para outros dominios, deixar undefined
    domain = undefined;
  }



  return {
    domain: domain,
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: false,
  };
}
