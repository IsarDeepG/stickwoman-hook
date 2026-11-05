/**
 * Razorpay order/verify server helpers for Hook unlocks.
 * Crypto primitives live in ./razorpay-crypto (unit-tested without env).
 */
import { env } from "@/lib/env.server";
import {
  assertCapturedPayment,
  mintUnlockToken,
  parseUnlockToken,
  type ExpectedCharge,
  type RazorpayPayment,
  type UnlockPayload,
  verifyPaymentSignature,
} from "@/lib/razorpay-crypto";

export {
  assertCapturedPayment,
  mintUnlockToken,
  parseUnlockToken,
  verifyPaymentSignature,
};
export type { ExpectedCharge, RazorpayPayment, UnlockPayload };

const RAZORPAY_API = "https://api.razorpay.com/v1";

export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

export function getRazorpayCredentials(): RazorpayCredentials | null {
  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function getExpectedCharge(): ExpectedCharge {
  const amountRaw = env("RAZORPAY_AMOUNT") ?? "500";
  const amount = Number.parseInt(amountRaw, 10);
  const currency = (env("RAZORPAY_CURRENCY") ?? "USD").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("RAZORPAY_AMOUNT must be a positive integer (smallest currency unit)");
  }
  return { amount, currency };
}

export function unlockSigningSecret(creds: RazorpayCredentials): string {
  return env("UNLOCK_TOKEN_SECRET") ?? creds.keySecret;
}

export function basicAuthHeader(creds: RazorpayCredentials): string {
  return `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
}

export function randomReceipt(): string {
  return `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchRazorpayPayment(
  paymentId: string,
  creds: RazorpayCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<RazorpayPayment> {
  const res = await fetchImpl(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(creds),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay payment fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as RazorpayPayment;
}

export async function createRazorpayOrder(
  creds: RazorpayCredentials,
  charge: ExpectedCharge,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetchImpl(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(creds),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: charge.amount,
      currency: charge.currency,
      receipt: randomReceipt(),
      notes: { game: "hook" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay order create failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { id: string; amount: number; currency: string };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
