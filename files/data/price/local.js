// ============================================================
// data/price/local.js
// Responsibility: JSON file read/write ONLY.
// Acts as persistent cache + fallback data store.
// ============================================================

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "priceStore.json");
const MAX_HISTORY = 20; // sliding window — keep last 20 entries

/**
 * Load the entire store from disk.
 * Returns empty object if file doesn't exist or is corrupted.
 */
function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[LocalData] Failed to parse priceStore.json, resetting:", err.message);
    return {};
  }
}

/**
 * Save the entire store to disk atomically.
 * Swallows errors so backend never crashes on a write failure.
 */
function saveStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[LocalData] Failed to write priceStore.json:", err.message);
  }
}

/**
 * Retrieve stored data for a productId.
 * Returns null if not found.
 */
function getLocalProduct(productId) {
  const store = loadStore();
  const key = String(productId);
  return store[key] || null;
}

/**
 * Update store with a fresh price from API.
 * - Sets currentPrice
 * - Appends to history with a sliding window of MAX_HISTORY
 */
function updateLocalProduct(productId, price) {
  const store = loadStore();
  const key = String(productId);

  if (!store[key]) {
    store[key] = { currentPrice: price, history: [] };
  }

  store[key].currentPrice = price;
  store[key].history.push({ price, time: Date.now() });

  // Enforce sliding window
  if (store[key].history.length > MAX_HISTORY) {
    store[key].history = store[key].history.slice(-MAX_HISTORY);
  }

  saveStore(store);
  return store[key];
}

/**
 * Get just the history array for a productId.
 * Returns [] if no data exists.
 */
function getHistory(productId) {
  const entry = getLocalProduct(productId);
  return entry ? entry.history : [];
}

module.exports = { getLocalProduct, updateLocalProduct, getHistory };
