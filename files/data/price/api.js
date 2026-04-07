// ============================================================
// data/price/api.js
// Responsibility: External API calls ONLY.
//
// Live price sources (all FREE):
//   1. data.gov.in Agmarknet — mandi prices for vegetables & fruits
//      Resource: 9ef84268-d588-465a-a308-a864a43d0070
//      Price unit: ₹/quintal  →  converted to ₹/kg on return
//
//   2. Open Food Facts — packaged food / groceries
//      https://world.openfoodfacts.org/  — no key required
//
// For all other categories returns null (caller uses static DB).
// ============================================================

const TIMEOUT_MS = 5000;

// ─── safeFetch ────────────────────────────────────────────────
async function safeFetch(url) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Timeout (${TIMEOUT_MS}ms): ${url}`);
    throw err;
  } finally {
    clearTimeout(tid);
  }
}

// ─── 1. data.gov.in Agmarknet ────────────────────────────────
// API key — set DATAGOVIN_API_KEY in your environment.
// If it is missing, the app will silently fall back to static pricing.
const DATAGOVIN_API_KEY = process.env.DATAGOVIN_API_KEY;

const DATAGOVIN_BASE =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

// Our product names → Agmarknet commodity spellings
const AGMARKNET_COMMODITY_MAP = {
  "tomato":          "Tomato",
  "potato":          "Potato",
  "onion":           "Onion",
  "garlic":          "Garlic",
  "ginger":          "Ginger",
  "green chilli":    "Green Chilli",
  "capsicum":        "Capsicum",
  "brinjal":         "Brinjal",
  "cauliflower":     "Cauliflower",
  "cabbage":         "Cabbage",
  "spinach":         "Spinach",
  "methi":           "Methi(Fenugreek)",
  "coriander":       "Coriander Leaves",
  "carrot":          "Carrot",
  "beetroot":        "Beetroot",
  "radish":          "Raddish",
  "turnip":          "Turnip",
  "peas":            "Peas Wet",
  "french beans":    "Beans",
  "lady finger":     "Bhindi(Ladies Finger)",
  "bitter gourd":    "Bitter gourd",
  "bottle gourd":    "Bottle gourd",
  "ridge gourd":     "Ridgeguard(Turai)",
  "pumpkin":         "Pumpkin",
  "sweet potato":    "Sweet Potato",
  "tinda":           "Tinda",
  "parwal":          "Parwal",
  "snake gourd":     "Snake Gourd",
  "ash gourd":       "Ash Gourd",
  "yam":             "Yam",
  "banana":          "Banana",
  "apple":           "Apple",
  "mango":           "Mango",
  "orange":          "Orange",
  "grapes":          "Grapes",
  "watermelon":      "Water Melon",
  "papaya":          "Papaya",
  "guava":           "Guava",
  "pineapple":       "Pineapple",
  "pomegranate":     "Pomegranate",
  "strawberry":      "Strawberry",
  "kiwi":            "Kiwi",
  "coconut":         "Coconut",
  "lemon":           "Lemon",
  "chikoo":          "Sapota(Chiku)",
  "corn":            "Sweet Corn",
  "mushroom":        "Mushroom",
  "broccoli":        "Broccoli",
};

async function fetchMandiPrice(productName) {
  if (!DATAGOVIN_API_KEY) return null;

  const commodity = AGMARKNET_COMMODITY_MAP[productName.toLowerCase().trim()];
  if (!commodity) return null; // not in our map → use static fallback

  // data.gov.in filter syntax: filters[field]=value
  const params = new URLSearchParams({
    "api-key": DATAGOVIN_API_KEY,
    format:    "json",
    limit:     "20",
  });
  params.append("filters[commodity]", commodity);

  const data = await safeFetch(`${DATAGOVIN_BASE}?${params}`);

  // Response shape: { records: [ { commodity, market, state, min_price, max_price, modal_price, arrival_date }, ... ] }
  if (!data || !Array.isArray(data.records) || data.records.length === 0) {
    return null;
  }

  // Parse modal_price (₹/quintal). Field name is lowercase in this dataset.
  const modalPrices = data.records
    .map((r) => {
      const raw = r.modal_price ?? r.Modal_Price ?? r["Modal Price"] ?? "";
      const val = parseFloat(String(raw).replace(/,/g, "").trim());
      return isNaN(val) || val <= 0 ? null : val;
    })
    .filter(Boolean);

  if (modalPrices.length === 0) return null;

  // Average across all returned mandis for a robust national estimate
  const avgPerQuintal = modalPrices.reduce((a, b) => a + b, 0) / modalPrices.length;
  const pricePerKg    = Math.round(avgPerQuintal / 100);
  if (pricePerKg <= 0) return null;

  // Gather distinct market names for display
  const markets = [...new Set(
    data.records.map((r) => r.market || r.Market).filter(Boolean)
  )].slice(0, 5);

  return {
    price:               pricePerKg,
    source:              "agmarknet",
    commodity,
    currency:            "INR",
    marketsQueried:      data.records.length,
    sampleMarkets:       markets,
    rawPricePerQuintal:  Math.round(avgPerQuintal),
    arrivalDate:         data.records[0]?.arrival_date || data.records[0]?.Arrival_Date || null,
  };
}

// ─── 2. Open Food Facts ───────────────────────────────────────
// Free, no key. Returns INR price only for India-tagged products.
const OPENFOODFACTS_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

async function fetchGroceryPrice(productName) {
  const cleanName = productName
    .replace(/\b\d+\s*(g|kg|ml|l|gm|ltr|litre|liter|pack|pcs|pc)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const params = new URLSearchParams({
    search_terms: cleanName,
    search_simple: "1",
    action:        "process",
    json:          "1",
    page_size:     "5",
    fields:        "product_name,price,price_per_unit,countries_tags",
  });

  const data = await safeFetch(`${OPENFOODFACTS_SEARCH}?${params}`);
  if (!data || !Array.isArray(data.products) || data.products.length === 0) return null;

  for (const product of data.products) {
    const raw = product.price || product.price_per_unit;
    if (!raw) continue;
    const parsed = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    if (isNaN(parsed) || parsed <= 0) continue;
    const countries = Array.isArray(product.countries_tags) ? product.countries_tags : [];
    if (countries.some((c) => c === "en:india" || c.includes("india"))) {
      return {
        price:       Math.round(parsed),
        source:      "openfoodfacts",
        productName: product.product_name || productName,
        currency:    "INR",
      };
    }
  }
  return null; // no INR price found — caller uses static fallback
}

// ─── Main Export ──────────────────────────────────────────────
async function fetchLivePrice(productName, category) {
  const name = (productName || "").toLowerCase().trim();
  const cat  = (category  || "").toLowerCase().trim();

  if (cat === "vegetables" || cat === "fruits") return await fetchMandiPrice(name);
  if (cat === "groceries")                       return await fetchGroceryPrice(name);
  return null; // electronics, fashion, etc. — no free live source
}

// ─── Legacy: DummyJSON (kept for GET /price/:productId route) ─
const DUMMYJSON_BASE = "https://dummyjson.com/products";

async function fetchProductFromAPI(productId) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${DUMMYJSON_BASE}/${productId}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`DummyJSON returned status ${res.status}`);
    const data = await res.json();
    if (typeof data.id !== "number" || typeof data.title !== "string" || typeof data.price !== "number") {
      throw new Error("Invalid response shape from DummyJSON API");
    }
    return { id: data.id, name: data.title, price: data.price, timestamp: Date.now() };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("DummyJSON timeout after 2000ms");
    throw err;
  } finally {
    clearTimeout(tid);
  }
}

module.exports = { fetchLivePrice, fetchProductFromAPI };
