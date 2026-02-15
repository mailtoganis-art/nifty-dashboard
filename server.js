const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MARKET TIME CHECK (IST)
========================= */
function isMarketOpen() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);

  const day = istTime.getDay(); // 0=Sun, 6=Sat
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  if (day === 0 || day === 6) return false;
  if (currentMinutes < marketOpen || currentMinutes > marketClose) return false;

  return true;
}

/* =========================
   EMA CALCULATION
========================= */
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];

  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/* =========================
   RSI CALCULATION
========================= */
function calculateRSI(data, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/* =========================
   ADVANCED INTELLIGENCE API
========================= */
app.get("/api/intelligence", async (req, res) => {
  try {
    if (!isMarketOpen()) {
      return res.json({
        marketStatus: "CLOSED",
        message: "Market Closed (Weekend or Outside Trading Hours)"
      });
    }

    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d"
    );

    const data = await response.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(Boolean);
    const meta = result.meta;

    const current = meta.regularMarketPrice;
    const previous = meta.previousClose;

    /* ===== TREND ANALYSIS ===== */
    const last10 = closes.slice(-10);
    const trendSlope = last10[last10.length - 1] - last10[0];

    /* ===== EMA ANALYSIS ===== */
    const ema9 = calculateEMA(closes.slice(-20), 9);
    const ema21 = calculateEMA(closes.slice(-30), 21);

    /* ===== RSI ANALYSIS ===== */
    const rsi = calculateRSI(closes.slice(-15));

    /* ===== SCORING ENGINE ===== */
    let score = 0;

    // Trend weight (30%)
    if (trendSlope > 0) score += 30;
    else score -= 30;

    // EMA crossover (30%)
    if (ema9 > ema21) score += 30;
    else score -= 30;

    // RSI logic (20%)
    if (rsi > 55) score += 20;
    else if (rsi < 45) score -= 20;

    // Price vs Previous Close (20%)
    if (current > previous) score += 20;
    else score -= 20;

    let decision = "NEUTRAL";
    if (score >= 30) decision = "CALL SIDE";
    else if (score <= -30) decision = "PUT SIDE";

    const confidence = Math.min(Math.abs(score), 100);

    /* ===== ENTRY & INVALIDATION LEVEL ===== */
    const entryLevel = decision === "CALL SIDE"
      ? current + 5
      : decision === "PUT SIDE"
      ? current - 5
      : current;

    const invalidationLevel = decision === "CALL SIDE"
      ? current - 15
      : decision === "PUT SIDE"
      ? current + 15
      : current;

    res.json({
      marketStatus: "OPEN",
      currentPrice: current,
      previousClose: previous,
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      rsi: rsi.toFixed(2),
      trendSlope: trendSlope.toFixed(2),
      decision: decision,
      confidence: confidence,
      suggestedEntry: entryLevel.toFixed(2),
      invalidationLevel: invalidationLevel.toFixed(2)
    });

  } catch (err) {
    res.status(500).json({ error: "Intelligence Engine Failed" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("Advanced Intelligence Engine running on port " + PORT);
});