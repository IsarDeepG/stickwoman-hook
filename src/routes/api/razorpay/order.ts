import { createFileRoute } from "@tanstack/react-router";
import { optionsResponse, withCors } from "@/lib/razorpay-cors";
import {
  createRazorpayOrder,
  getExpectedCharge,
  getRazorpayCredentials,
  json,
} from "@/lib/razorpay.server";

export const Route = createFileRoute("/api/razorpay/order")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => optionsResponse(request),
      POST: async ({ request }) => {
        const creds = getRazorpayCredentials();
        if (!creds) {
          return withCors(
            request,
            json(
              {
                error: "payments_not_configured",
                message:
                  "Razorpay keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
              },
              503,
            ),
          );
        }
        let charge;
        try {
          charge = getExpectedCharge();
        } catch (err) {
          return withCors(
            request,
            json(
              {
                error: "invalid_amount_config",
                message: err instanceof Error ? err.message : "Invalid amount config",
              },
              503,
            ),
          );
        }
        try {
          const order = await createRazorpayOrder(creds, charge);
          return withCors(
            request,
            json({
              orderId: order.id,
              amount: order.amount,
              currency: order.currency,
              keyId: creds.keyId,
            }),
          );
        } catch (err) {
          console.error("[razorpay/order]", err instanceof Error ? err.message : err);
          return withCors(
            request,
            json({ error: "order_failed", message: "Could not create payment order." }, 502),
          );
        }
      },
    },
  },
});
