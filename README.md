# Chulo — Nepali & North Indian restaurant demo

A complete demo website for a fictional restaurant, **Chulo**: an editorial homepage, online ordering
(collection & delivery, ASAP or scheduled), table booking with live availability, order tracking,
booking management, and a kitchen/admin view, all running on one small, documented API.

No frameworks and no build step. Plain HTML, CSS and JavaScript, plus a zero-dependency Node server.

**Live demo:** https://chulo-restaurant-demo.vercel.app · kitchen view: https://chulo-restaurant-demo.vercel.app/admin/

```
public/              the website (deployable as static files)
  index.html         home
  order.html         menu, cart and checkout
  track.html         live order status
  book.html          table booking + manage/cancel
  admin/             kitchen view: orders board, bookings, sold-out toggles
  js/menu-data.js    ← menu, prices, opening hours, tables, delivery rules (edit this)
  js/core.js         business rules shared by browser and server
  js/api.js          API client (server or in-browser fallback)
server.js            Node API + static server, stores data in data/db.json
```

## Run it locally (full mode)

```bash
npm start
```

Open http://localhost:3000. The kitchen view is at http://localhost:3000/admin/ (default key `chulo-demo`).
Place an order in one tab and watch it land on the kitchen board in another; move it along and the
customer's tracking page updates within a few seconds.

`npm run reset` wipes `data/` and re-seeds a few sample bookings.

## Deploy to Vercel

The repo is set up for Vercel as-is (`vercel.json` serves `public/`):

1. Import the GitHub repo in Vercel. No framework preset, no build command needed.
2. Deploy.

On Vercel there is no persistent server, so the site automatically switches to **browser demo mode**:
the exact same rules from `core.js` run in the browser and orders/bookings are kept in
`localStorage`. Everything works end to end, including the kitchen view, as long as you use the same
browser. The admin header shows **Browser demo** vs **Live server** so you always know which mode you're in.

For real, shared data, run `server.js` anywhere that runs Node (Render, Railway, Fly.io, a VPS) and point
the static site at it by adding this before `api.js` on each page:

```html
<script>window.CHULO_API_BASE = 'https://api.your-restaurant.com'</script>
```

Set `CORS_ORIGIN` on the server to your Vercel domain.

## Connecting your own admin / POS

Everything the website and kitchen view do goes through the REST API below, so another app (a React
admin, Retool, a POS or printer integration) can do the same. Prices are integers in pence.

### Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/menu` | settings, categories, items (with live `available`) |
| GET | `/api/availability?date=YYYY-MM-DD&party=4` | bookable slots with `available` and `reason` (`past` / `full`) |
| POST | `/api/reservations` | `{ party, date, time, name, email, phone, occasion?, seating?, notes? }` |
| GET | `/api/reservations/:ref?email=` | email must match |
| POST | `/api/reservations/:ref/cancel` | `{ email }` |
| POST | `/api/orders` | see below; totals are always recalculated on the server |
| GET | `/api/orders/:ref` | customer-safe view used by the tracking page |

Order body:

```json
{
  "type": "delivery",
  "when": { "asap": true },
  "customer": { "name": "…", "phone": "…", "email": "…" },
  "address": { "line1": "…", "line2": "", "postcode": "E8 1AA", "instructions": "" },
  "items": [{ "itemId": "jhol-momo", "qty": 2, "options": { "filling": "lamb" }, "note": "" }],
  "payment": "card_on_arrival",
  "notes": "",
  "cutlery": false
}
```

Use `"when": { "date": "2026-10-24", "time": "19:30" }` for scheduled orders.

### Admin (header `x-admin-key: <ADMIN_KEY>`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/orders?date=` | full orders incl. customer & address |
| PATCH | `/api/admin/orders/:ref` | `{ status }`: `received → preparing → ready \| out_for_delivery → completed`, or `cancelled`; `{ paymentStatus: "paid" }` |
| GET | `/api/admin/reservations?date=` | |
| POST | `/api/admin/reservations` | phone/walk-in booking, same body as public |
| PATCH | `/api/admin/reservations/:ref` | `{ status, table, notes }`; status: `confirmed, seated, completed, cancelled, no_show` |
| PATCH | `/api/admin/menu/:itemId` | `{ available: false }` to mark sold out, `{ price: 1295 }` |

Errors always look like `{ "error": { "code", "message", "field" } }` with a 4xx status.

### Webhooks

Set `WEBHOOK_URL` and the server POSTs `{ event, data, at }` for `order.created`, `order.updated`,
`reservation.created`, `reservation.updated` and `menu.updated`. Use it to push into your admin,
send confirmation emails/SMS, or print kitchen tickets.

### Server environment

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `ADMIN_KEY` | `chulo-demo` | change this for anything public |
| `WEBHOOK_URL` | – | optional |
| `CORS_ORIGIN` | `*` | set to your site/admin origin |

## Making it yours

- **Menu, prices, hours, tables, delivery fee:** `public/js/menu-data.js`
- **Colours and type:** the tokens at the top of `public/css/style.css`
- **Photos:** Unsplash images are hot-linked by id; replace with your own photography
- **Payments:** checkout offers pay-on-collection/delivery. To take card payments online, create a
  Stripe Checkout session after `POST /api/orders` succeeds and redirect to it.

Contact details use reserved fictional ranges (020 7946 0xxx, `.example` email) so nothing reaches a real business.
