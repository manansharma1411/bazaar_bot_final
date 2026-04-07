// ============================================================
// services/priceService.js
// Responsibility: Business logic ONLY.
//
// Live price lookup flow for /api/analyze:
//   Live API (OFacts / Agmarknet) → static products.js → error
//
// Legacy flow for /price/:productId (DummyJSON):
//   Memory Cache → DummyJSON API → Local JSON store → error
// ============================================================

const { fetchLivePrice, fetchProductFromAPI } = require("../data/price/api");
const { getLocalProduct, updateLocalProduct } = require("../data/price/local");

// ─── In-Memory Cache (for DummyJSON / legacy route) ──────────
const memoryCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

function getCached(productId) {
  const cached = memoryCache.get(String(productId));
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) { memoryCache.delete(String(productId)); return null; }
  return cached.data;
}
function setCache(productId, data) {
  memoryCache.set(String(productId), { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Live Price Cache (for /api/analyze) ─────────────────────
// Caches live mandi/OFacts results to avoid hammering free APIs.
const livePriceCache = new Map();
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachedLive(key) {
  const entry = livePriceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { livePriceCache.delete(key); return null; }
  return entry.data;
}
function setCachedLive(key, data) {
  livePriceCache.set(key, { data, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
}

// ─── getLivePrice ─────────────────────────────────────────────
/**
 * Attempt to fetch a real-time price from the appropriate free API.
 * Returns null when no live data is available (non-error fallback).
 *
 * @param {string} productName  — matched product name (lowercase)
 * @param {string} category     — "vegetables" | "fruits" | "groceries" | other
 * @returns {{ price, source, currency, ...meta } | null}
 */
async function getLivePrice(productName, category) {
  const cacheKey = `${category}:${productName}`;
  const cached = getCachedLive(cacheKey);
  if (cached !== null) return cached;

  try {
    const result = await fetchLivePrice(productName, category);
    if (result && result.price > 0) {
      setCachedLive(cacheKey, result);
      return result;
    }
    // null result is expected for many products — not an error
    setCachedLive(cacheKey, null);
    return null;
  } catch (err) {
    // Log but do NOT propagate — caller uses static price as fallback
    console.warn(`[PriceService] Live price fetch failed for "${productName}" (${category}): ${err.message}`);
    return null;
  }
}

// ─── getPriceData (legacy: /price/:productId via DummyJSON) ───
/**
 * @param {number|string} productId — integer 1–100
 */
async function getPriceData(productId) {
  const id = parseInt(productId, 10);
  if (isNaN(id) || id < 1 || id > 100) {
    throw new Error("Invalid productId. Must be an integer between 1 and 100.");
  }

  const cached = getCached(id);
  if (cached) return cached;

  let source = "api", isFallback = false, currentPrice, localEntry;

  try {
    const apiProduct = await fetchProductFromAPI(id);
    localEntry = updateLocalProduct(id, apiProduct.price);
    currentPrice = apiProduct.price;
  } catch (apiErr) {
    console.warn(`[PriceService] DummyJSON API failed for product ${id}: ${apiErr.message}`);
    isFallback = true;
    source = "local";
    localEntry = getLocalProduct(id);
    if (!localEntry || !localEntry.history || localEntry.history.length === 0) {
      throw new Error(
        `Price data unavailable: API is down and no cached data exists for product ${id}.`
      );
    }
    currentPrice = localEntry.currentPrice;
  }

  const history = localEntry.history || [];
  const lastUpdated = history.length > 0 ? history[history.length - 1].time : Date.now();
  const result = { source, isFallback, productId: id, currentPrice, history, lastUpdated };
  setCache(id, result);
  return result;
}

module.exports = { getLivePrice, getPriceData };
