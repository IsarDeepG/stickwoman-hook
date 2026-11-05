import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedPaymentOrigin, optionsResponse, withCors } from "./razorpay-cors.ts";

describe("isAllowedPaymentOrigin", () => {
  it("allows itch.io embed hosts", () => {
    assert.equal(isAllowedPaymentOrigin("https://html-classic.itch.zone"), true);
    assert.equal(isAllowedPaymentOrigin("https://foo.itch.zone"), true);
    assert.equal(isAllowedPaymentOrigin("https://v6p9d9t4.ssl.hwcdn.net"), true);
    assert.equal(isAllowedPaymentOrigin("https://hollyhaunt-games.itch.io"), true);
    assert.equal(isAllowedPaymentOrigin("https://itch.io"), true);
  });

  it("allows the Vercel production host and previews", () => {
    assert.equal(isAllowedPaymentOrigin("https://stickwoman-hook.vercel.app"), true);
    assert.equal(
      isAllowedPaymentOrigin("https://stickwoman-hook-git-main-mera-hissa.vercel.app"),
      false,
    );
    assert.equal(
      isAllowedPaymentOrigin("https://stickwoman-hook-abc123.vercel.app"),
      false,
    );
    assert.equal(
      isAllowedPaymentOrigin("https://preview.stickwoman-hook.vercel.app"),
      true,
    );
  });

  it("allows localhost over http for local checks", () => {
    assert.equal(isAllowedPaymentOrigin("http://localhost:5173"), true);
    assert.equal(isAllowedPaymentOrigin("http://127.0.0.1:8080"), true);
  });

  it("rejects unrelated origins", () => {
    assert.equal(isAllowedPaymentOrigin("https://evil.example"), false);
    assert.equal(isAllowedPaymentOrigin("https://itch.io.evil.com"), false);
    assert.equal(isAllowedPaymentOrigin("http://html-classic.itch.zone"), false);
    assert.equal(isAllowedPaymentOrigin(null), false);
    assert.equal(isAllowedPaymentOrigin(""), false);
    assert.equal(isAllowedPaymentOrigin("not-a-url"), false);
  });
});

describe("withCors / optionsResponse", () => {
  it("echoes allowed Origin and sets Vary", () => {
    const req = new Request("https://stickwoman-hook.vercel.app/api/razorpay/order", {
      method: "POST",
      headers: { Origin: "https://html-classic.itch.zone" },
    });
    const base = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const res = withCors(req, base);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://html-classic.itch.zone");
    assert.match(res.headers.get("Vary") || "", /Origin/i);
  });

  it("does not reflect a disallowed Origin", () => {
    const req = new Request("https://stickwoman-hook.vercel.app/api/razorpay/order", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    const res = withCors(req, new Response("{}", { status: 200 }));
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  });

  it("answers OPTIONS preflight for allowed origins", () => {
    const req = new Request("https://stickwoman-hook.vercel.app/api/razorpay/order", {
      method: "OPTIONS",
      headers: {
        Origin: "https://html-classic.itch.zone",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const res = optionsResponse(req);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://html-classic.itch.zone");
    assert.match(res.headers.get("Access-Control-Allow-Methods") || "", /POST/);
    assert.match(res.headers.get("Access-Control-Allow-Headers") || "", /content-type/i);
  });

  it("rejects OPTIONS from disallowed origins without ACAO", () => {
    const req = new Request("https://stickwoman-hook.vercel.app/api/razorpay/order", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    const res = optionsResponse(req);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  });
});
