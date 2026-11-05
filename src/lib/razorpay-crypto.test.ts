import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  assertCapturedPayment,
  mintUnlockToken,
  parseUnlockToken,
  verifyPaymentSignature,
} from "./razorpay-crypto.ts";

describe("verifyPaymentSignature", () => {
  it("accepts a correctly computed HMAC", () => {
    const secret = "test_secret_key";
    const orderId = "order_ABC";
    const paymentId = "pay_XYZ";
    const signature = createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    assert.equal(verifyPaymentSignature(orderId, paymentId, signature, secret), true);
  });

  it("rejects a bad signature", () => {
    const secret = "test_secret_key";
    assert.equal(
      verifyPaymentSignature("order_ABC", "pay_XYZ", "0".repeat(64), secret),
      false,
    );
  });

  it("rejects a signature of different length", () => {
    assert.equal(verifyPaymentSignature("o", "p", "abcd", "secret"), false);
  });
});

describe("unlock tokens", () => {
  it("round-trips a minted token", () => {
    const secret = "unlock_secret";
    const token = mintUnlockToken(
      { paymentId: "pay_1", orderId: "order_1", iat: 1_700_000_000 },
      secret,
    );
    const parsed = parseUnlockToken(token, secret);
    assert.deepEqual(parsed, {
      paymentId: "pay_1",
      orderId: "order_1",
      iat: 1_700_000_000,
    });
  });

  it("rejects a tampered token", () => {
    const secret = "unlock_secret";
    const token = mintUnlockToken(
      { paymentId: "pay_1", orderId: "order_1", iat: 1 },
      secret,
    );
    const [body, sig] = token.split(".");
    assert.ok(body && sig);
    const flipped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
    assert.equal(parseUnlockToken(`${body}.${flipped}`, secret), null);
  });

  it("rejects a token signed with another secret", () => {
    const token = mintUnlockToken(
      { paymentId: "pay_1", orderId: "order_1", iat: 1 },
      "secret-a",
    );
    assert.equal(parseUnlockToken(token, "secret-b"), null);
  });
});

describe("assertCapturedPayment", () => {
  const expected = { amount: 500, currency: "USD" };

  it("accepts a matching captured payment", () => {
    const result = assertCapturedPayment(
      {
        id: "pay_1",
        status: "captured",
        order_id: "order_1",
        amount: 500,
        currency: "USD",
      },
      "order_1",
      expected,
    );
    assert.equal(result.ok, true);
  });

  it("rejects authorized with retry", () => {
    const result = assertCapturedPayment(
      {
        id: "pay_1",
        status: "authorized",
        order_id: "order_1",
        amount: 500,
        currency: "USD",
      },
      "order_1",
      expected,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.retry, true);
      assert.equal(result.status, 409);
    }
  });

  it("rejects amount mismatch", () => {
    const result = assertCapturedPayment(
      {
        id: "pay_1",
        status: "captured",
        order_id: "order_1",
        amount: 100,
        currency: "USD",
      },
      "order_1",
      expected,
    );
    assert.equal(result.ok, false);
  });
});
