/**
 * Client helpers for verified Razorpay Checkout unlocks.
 *
 * Legacy single-use payment link (do not use — customer-bound, one-shot):
 *   https://rzp.io/rzp/UJz1A1g  (plink_TgjNX0IOEL2y0R)
 *
 * Unlock is only granted after /api/razorpay/verify confirms a captured payment
 * and returns a signed token stored under UNLOCK_TOKEN_KEY.
 */

export const RAZORPAY_LABEL = "USD 5";
export const UNLOCK_TOKEN_KEY = "hook-unlock-token";
/** Legacy flag — ignored for unlock; cleared when a real token is stored. */
export const LEGACY_PAID_KEY = "hook-paid";

/**
 * Optional absolute API origin for static/itch embeds.
 * Empty (default) keeps same-origin relative paths for the Vercel app itself.
 * Example for itch.zip: VITE_API_BASE=https://stickwoman-hook.vercel.app
 */
const API_BASE = String(import.meta.env.VITE_API_BASE ?? "")
  .trim()
  .replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export type OrderResponse = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
};

export type PayStartResult =
  | { ok: true; order: OrderResponse }
  | { ok: false; kind: "not_configured" | "failed"; message: string };

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; kind: "failed" | "retry"; message: string };

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout requires a browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-razorpay-checkout="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Checkout script failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "1";
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout."));
    };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
}

export async function createUnlockOrder(): Promise<PayStartResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/razorpay/order"), { method: "POST" });
  } catch {
    return { ok: false, kind: "failed", message: "Network error creating order." };
  }
  if (res.status === 503) {
    return {
      ok: false,
      kind: "not_configured",
      message: "Payments aren't configured on this server yet.",
    };
  }
  if (!res.ok) {
    return { ok: false, kind: "failed", message: "Could not start payment. Try again." };
  }
  const order = (await res.json()) as OrderResponse;
  if (!order?.orderId || !order?.keyId) {
    return { ok: false, kind: "failed", message: "Invalid order response." };
  }
  return { ok: true, order };
}

export async function verifyUnlockPayment(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<VerifyResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/razorpay/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, kind: "failed", message: "Network error verifying payment." };
  }
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    message?: string;
    retry?: boolean;
  };
  if (!res.ok || !data.token) {
    return {
      ok: false,
      kind: data.retry ? "retry" : "failed",
      message: data.message || "Payment failed, try again.",
    };
  }
  return { ok: true, token: data.token };
}

export async function checkUnlockToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/razorpay/check"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { paid?: boolean };
    return data.paid === true;
  } catch {
    return false;
  }
}

export function storeUnlockToken(token: string): void {
  localStorage.setItem(UNLOCK_TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_PAID_KEY);
}

export function readStoredUnlockToken(): string | null {
  return localStorage.getItem(UNLOCK_TOKEN_KEY);
}

/**
 * Open Razorpay Checkout for an order. Resolves with the checkout response on
 * success, or null if the player dismissed the modal.
 */
export async function openRazorpayCheckout(order: OrderResponse): Promise<{
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
} | null> {
  await loadRazorpayCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay Checkout is unavailable.");

  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Hook",
      description: "Unlocking game levels",
      order_id: order.orderId,
      theme: { color: "#e23b28" },
      handler(response) {
        settled = true;
        resolve(response);
      },
      modal: {
        ondismiss() {
          if (!settled) resolve(null);
        },
      },
    });
    try {
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });
}
