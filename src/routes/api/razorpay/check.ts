import { createFileRoute } from "@tanstack/react-router";
import {
  getRazorpayCredentials,
  json,
  parseUnlockToken,
  unlockSigningSecret,
} from "@/lib/razorpay.server";

async function readToken(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token")?.trim();
  if (fromQuery) return fromQuery;
  if (request.method === "GET") return null;
  try {
    const body = (await request.json()) as { token?: string };
    return body.token?.trim() || null;
  } catch {
    return null;
  }
}

async function handleCheck(request: Request): Promise<Response> {
  const creds = getRazorpayCredentials();
  if (!creds) {
    // Fail closed: without keys we cannot validate a token.
    return json({ paid: false, error: "payments_not_configured" }, 503);
  }
  const token = await readToken(request);
  if (!token) {
    return json({ paid: false, error: "missing_token" }, 400);
  }
  const payload = parseUnlockToken(token, unlockSigningSecret(creds));
  if (!payload) {
    return json({ paid: false });
  }
  return json({ paid: true, paymentId: payload.paymentId, orderId: payload.orderId });
}

export const Route = createFileRoute("/api/razorpay/check")({
  server: {
    handlers: {
      GET: async ({ request }) => handleCheck(request),
      POST: async ({ request }) => handleCheck(request),
    },
  },
});
