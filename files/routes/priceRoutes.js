// ============================================================
// routes/priceRoutes.js
// Responsibility: HTTP layer ONLY.
// Validates request → calls service → sends response.
// No business logic lives here.
// ============================================================

const express = require("express");
const router = express.Router();
const { getPriceData } = require("../services/priceService");

/**
 * GET /price/:productId
 *
 * Returns live or fallback price data for the given productId.
 * productId should be an integer (1–100) matching DummyJSON product IDs.
 *
 * Response shape:
 * {
 *   source: "api" | "local",
 *   isFallback: boolean,
 *   productId: number,
 *   currentPrice: number,
 *   history: [{ price: number, time: timestamp }],
 *   lastUpdated: timestamp
 * }
 */
router.get("/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    const data = await getPriceData(productId);
    return res.json(data);
  } catch (err) {
    // Distinguish client errors (bad input) from server errors (API down)
    const isClientError = err.message.includes("Invalid productId");
    const statusCode = isClientError ? 400 : 503;

    return res.status(statusCode).json({
      error: err.message,
      isFallback: true,
    });
  }
});

module.exports = router;
