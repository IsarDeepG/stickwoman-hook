# Hook

A stickwoman swings from ring to ring. Hold to catch, let go to fly.

After two finished runs, Razorpay Checkout unlocks the next lines for **USD 5**.
Payment is verified on the server before the game unlocks — clicking pay alone
does nothing.

```bash
npm install
cp .env.example .env   # then fill in Razorpay keys
npm run dev
```

Then open the address the dev server prints. One finger is enough on a phone.

## Razorpay setup

1. In the [Razorpay Dashboard](https://dashboard.razorpay.com/) open
   **Account & Settings → API Keys**. Create test keys first, then live keys
   when you are ready.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the environment
   (local `.env`, and Vercel **Project → Settings → Environment Variables**).
3. Optional: `UNLOCK_TOKEN_SECRET` (defaults to the key secret),
   `RAZORPAY_AMOUNT` (default `500` = smallest units), `RAZORPAY_CURRENCY`
   (default `USD`).
4. **USD** charges need **International Payments** enabled on the Razorpay
   account. Without that, order creation will fail for currency `USD`.
5. Deploy the app so `/api/razorpay/order`, `/api/razorpay/verify`, and
   `/api/razorpay/check` are reachable from the game origin.

Flow: the client creates an order → opens Checkout.js → on success posts the
payment triple to verify → server checks the HMAC, fetches the payment from
Razorpay, requires status `captured` with matching amount/currency/order →
returns a signed unlock token stored in `localStorage` (`hook-unlock-token`).
On load the game re-validates that token via `/api/razorpay/check`.

The old `https://rzp.io/rzp/UJz1A1g` payment link is single-use and
customer-bound; it is no longer used.

## itch.io static build

The HTML5 zip calls this deployment for payments. Set
`VITE_API_BASE=https://stickwoman-hook.vercel.app` when building the static
bundle so `/api/razorpay/*` hits this server. The payment routes allow CORS from
`*.itch.io`, `*.itch.zone`, `html-classic.itch.zone`, and `*.hwcdn.net`.
Unlock state stays in `localStorage` (`hook-unlock-token`); no cookies required.
