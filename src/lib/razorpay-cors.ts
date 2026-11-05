/**
 * CORS allowlist for Razorpay unlock API routes so an itch.io-hosted
 * static build can call the Vercel deployment.
 *
 * Never reflects an arbitrary Origin. Never uses Access-Control-Allow-Origin: *.
 */

const EXACT_HOSTS = new Set([
  "html-classic.itch.zone",
  "stickwoman-hook.vercel.app",
]);

/** Suffix hosts: request host must equal the suffix or end with `.${suffix}`. */
const SUFFIX_HOSTS = [
  "itch.io",
  "itch.zone",
  "hwcdn.net",
  "stickwoman-hook.vercel.app",
] as const;

export function isAllowedPaymentOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  // itch / production always https; allow http only for local loopback testing
  const host = url.hostname.toLowerCase();
  if (url.protocol === "http:") {
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return false;
    return true;
  }
  if (EXACT_HOSTS.has(host)) return true;
  for (const suffix of SUFFIX_HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

function mergeVary(existing: string | null, value: string): string {
  if (!existing) return value;
  const parts = existing.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === value.toLowerCase())) return existing;
  return `${existing}, ${value}`;
}

/** Attach ACAO + Vary when Origin is allowed; otherwise leave the response unchanged. */
export function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedPaymentOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", mergeVary(headers.get("Vary"), "Origin"));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Preflight for allowed origins; 403 without CORS headers otherwise. */
export function optionsResponse(request: Request): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedPaymentOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  const requested =
    request.headers.get("Access-Control-Request-Headers")?.trim() || "content-type";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requested,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
