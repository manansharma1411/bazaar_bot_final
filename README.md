# 🤖 Bazaar Bot

**Market-Aware Negotiation Assistant** — tells you whether a price is fair and gives you a ready-to-use negotiation script.

---

## Live Price APIs

| Category | API | Key |
|---|---|---|
| 🥦 Vegetables & Fruits | **data.gov.in Agmarknet** — daily mandi ₹/quintal → ₹/kg | ✅ Included |
| 🛒 Packaged Groceries | **Open Food Facts** — crowd-sourced product prices | No key needed |
| 📱 Electronics / Fashion / Appliances | Static product DB (900+ items) | — |

---

## Quick Start

```bash
npm install
npm start
```

Visit **http://localhost:3000**

The Agmarknet API key is already embedded. If you ever need to rotate it, set:

```
DATAGOVIN_API_KEY=your_new_key
```

in a `.env` file at the project root — it will override the default.

---

## How Live Prices Work

```
POST /api/analyze
       │
       ├─ vegetables / fruits ──► Agmarknet (data.gov.in)
       │                          └─ fallback: static DB
       │
       ├─ groceries ────────────► Open Food Facts
       │                          └─ fallback: static DB
       │
       └─ all other categories ─► static DB (instant, no API call)
```

- Live prices **cached 10 minutes** — free APIs are never hammered.
- API failure → **silent fallback** to static data. Bot never crashes.
- Market Price card shows **🟢 Live · Agmarknet Mandi** badge when live data is used.

---

## Project Structure

```
├── server.js                 # Express app + /api/analyze
├── .env                      # API keys (gitignore this in production)
├── .env.example              # Key reference
├── routes/priceRoutes.js     # GET /price/:id (DummyJSON legacy)
├── services/priceService.js  # Business logic + caching
└── data/
    ├── products.js           # 900+ static Indian market prices
    └── price/
        ├── api.js            # Agmarknet + Open Food Facts calls
        ├── local.js          # Persistent JSON price store
        └── priceStore.json   # Auto-managed cache
```

---

## `/api/analyze` Response

```json
{
  "success": true,
  "matchedProduct": "Tomato",
  "category": "vegetables",
  "marketPrice": 38,
  "livePrice": {
    "price": 38,
    "source": "agmarknet",
    "currency": "INR",
    "fetchedAt": "2026-04-07T10:30:00.000Z",
    "commodity": "Tomato",
    "marketsQueried": 12,
    "rawPricePerQuintal": 3800,
    "sampleMarkets": ["Azadpur", "Nashik", "Pune"]
  },
  "strategy": { "verdict": "📊 Fair Price", ... },
  "script": "..."
}
```

`livePrice` is `null` for non-veg/fruit/grocery categories.
