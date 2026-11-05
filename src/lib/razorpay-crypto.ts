/**
 * Pure Razorpay signature / unlock-token helpers (no env / network).
 *
 * Unlock tokens are HMAC-signed and stored per-device in localStorage.
 * There is no server DB / replay store: a stolen token can unlock another
 * browser until the secret rotates. That is intentional for this game.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type UnlockPayload = {
  paymentId: string;
  orderId: string;
  iat: number;
};

export type ExpectedCharge = {
  amount: number;
  currency: string;
};

export type RazorpayPayment = {
  id: string;
  status: string;
  order_id?: string;
  amount: number;
  currency: string;
};

/** Constant-time compare of two equal-length utf8 strings. */
export function safeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqualString(expected, signature);
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlJson(value: unknown): string {
  return b64url(Buffer.from(JSON.stringify(value), "utf8"));
}

function fromB64url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

export function mintUnlockToken(payload: UnlockPayload, secret: string): string {
  const body = b64urlJson(payload);
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function parseUnlockToken(token: string, secret: string): UnlockPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  if (!safeEqualString(expected, sig)) return null;
  const raw = fromB64url(body);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as UnlockPayload;
    if (
      typeof parsed?.paymentId !== "string" ||
      typeof parsed?.orderId !== "string" ||
      typeof parsed?.iat !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * After HMAC signature check: require a captured payment that matches the order
 * and expected amount/currency. "authorized" alone is rejected (ask client to retry).
 */
export function assertCapturedPayment(
  payment: RazorpayPayment,
  orderId: string,
  expected: ExpectedCharge,
): { ok: true } | { ok: false; status: number; error: string; retry?: boolean } {
  if (payment.status === "authorized") {
    return {
      ok: false,
      status: 409,
      error: "Payment authorized but not captured yet. Please wait a moment and try again.",
      retry: true,
    };
  }
  if (payment.status !== "captured") {
    return {
      ok: false,
      status: 402,
      error: `Payment status is "${payment.status}", expected captured.`,
    };
  }
  if (payment.order_id !== orderId) {
    return { ok: false, status: 400, error: "Payment order_id does not match." };
  }
  if (Number(payment.amount) !== expected.amount) {
    return { ok: false, status: 400, error: "Payment amount does not match." };
  }
  if (String(payment.currency).toUpperCase() !== expected.currency) {
    return { ok: false, status: 400, error: "Payment currency does not match." };
  }
  return { ok: true };
}
