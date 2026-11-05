import { createFileRoute } from "@tanstack/react-router";
import {
  assertCapturedPayment,
  fetchRazorpayPayment,
  getExpectedCharge,
  getRazorpayCredentials,
  json,
  mintUnlockToken,
  unlockSigningSecret,
  verifyPaymentSignature,
} from "@/lib/razorpay.server";

type VerifyBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export const Route = createFileRoute("/api/razorpay/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const creds = getRazorpayCredentials();
        if (!creds) {
          return json(
            {
              error: "payments_not_configured",
              message:
                "Razorpay keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
            },
            503,
          );
        }

        let body: VerifyBody;
        try {
          body = (await request.json()) as VerifyBody;
        } catch {
          return json({ error: "invalid_json", message: "Expected JSON body." }, 400);
        }

        const orderId = body.razorpay_order_id?.trim();
        const paymentId = body.razorpay_payment_id?.trim();
        const signature = body.razorpay_signature?.trim();
        if (!orderId || !paymentId || !signature) {
          return json(
            {
              error: "missing_fields",
              message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
            },
            400,
          );
        }

        if (!verifyPaymentSignature(orderId, paymentId, signature, creds.keySecret)) {
          return json({ error: "bad_signature", message: "Payment signature is invalid." }, 400);
        }

        let charge;
        try {
          charge = getExpectedCharge();
        } catch (err) {
          return json(
            {
              error: "invalid_amount_config",
              message: err instanceof Error ? err.message : "Invalid amount config",
            },
            503,
          );
        }

        let payment;
        try {
          payment = await fetchRazorpayPayment(paymentId, creds);
        } catch (err) {
          console.error("[razorpay/verify]", err instanceof Error ? err.message : err);
          return json({ error: "payment_lookup_failed", message: "Could not confirm payment." }, 502);
        }

        const check = assertCapturedPayment(payment, orderId, charge);
        if (!check.ok) {
          return json(
            { error: "payment_not_captured", message: check.error, retry: Boolean(check.retry) },
            check.status,
          );
        }

        const token = mintUnlockToken(
          { paymentId, orderId, iat: Math.floor(Date.now() / 1000) },
          unlockSigningSecret(creds),
        );
        return json({ paid: true, token });
      },
    },
  },
});
