const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// 🔁 Replace with your real Nifty 5-min OHLC API
const DATA_URL = "https://your-api.com/nifty-5min";

const LOG_FILE = "trade_log.csv";

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(
    LOG_FILE,
    "timestamp,signal,confidence,regime,entryPrice,outcome\n"
  );
}

// ======================
// Utility Functions
// =====================

function mean(arr) {
  return arr.reduce((a, b) => a + b) / arr.length;
}

function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
}

function EMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function ATR(candles, period = 14) {
  let trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return mean(trs.slice(-period));
}

function VWAP(candles) {
  let cumPV = 0;
  let cumVol = 0;
  candles.forEach(c => {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * (c.volume || 1);
    cumVol += (c.volume || 1);
  });
  return cumPV / cumVol;
}

// =====================
// Quant Core Engine
// =====================

function analyzeMarket(candles) {
  const last20 = candles.slice(-20);
  const closes = last20.map(c => c.close);

  const current = last20[last20.length - 1];
  const price = current.close;

  // --- ATR Regime ---
  const atr = ATR(last20);
  const avgRange = mean(last20.map(c => c.high - c.low));
  const volatilityRatio = atr / avgRange;

  let regime = "RANGE";
  if (volatilityRatio > 1.2) regime = "VOLATILE";
  if (volatilityRatio < 0.8) regime = "COMPRESSION";

  // --- EMA Slope ---
  const emaFast = EMA(closes, 5);
  const emaSlow = EMA(closes, 15);
  const slope = emaFast - emaSlow;

  // --- Z-Score ---
  const z = (price - mean(closes)) / stdDev(closes);

  // --- VWAP Deviation ---
  const vwap = VWAP(last20);
  const vwapDev = (price - vwap) / atr;

  // =====================
  // Weighted Probability
  // =====================

  let bull = 0;
  let bear = 0;

  if (slope > 0) bull += 25;
  if (slope < 0) bear += 25;

  if (z > 0.8) bull += 20;
  if (z < -0.8) bear += 20;

  if (vwapDev > 0.5) bull += 15;
  if (vwapDev < -0.5) bear += 15;

  if (regime === "VOLATILE") {
    bull *= 1.1;
    bear *= 1.1;
  }

  const confidence = Math.min(Math.abs(bull - bear), 100);

  let signal = "WAIT";
  if (bull > bear && confidence > 55) signal = "CALL";
  if (bear > bull && confidence > 55) signal = "PUT";

  let confirmation = "NORMAL SETUP";
  if (confidence >= 75) {
    confirmation = "STRONGLY CONFIRMED – MULTI FACTOR ALIGNMENT";
  }
  if (confidence < 50) {
    signal = "WAIT";
    confirmation = "LOW EDGE – NO TRADE";
  }

  return {
    signal,
    confidence,
    regime,
    price,
    confirmation
  };
}

// =====================
// API Routes
// =====================

app.use(express.static(__dirname));

app.get("/analysis", async (req, res) => {
  try {
    const response = await axios.get(DATA_URL);
    const candles = response.data;

    const result = analyzeMarket(candles);

    // Log signal
    if (result.signal !== "WAIT") {
      const line = `${new Date().toISOString()},${result.signal},${result.confidence},${result.regime},${result.price},PENDING\n`;
      fs.appendFileSync(LOG_FILE, line);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Data fetch failed" });
  }
});

app.get("/performance", (req, res) => {
  const data = fs.readFileSync(LOG_FILE, "utf8").split("\n").slice(1);
  const trades = data.filter(row => row.includes("CALL") || row.includes("PUT"));

  res.json({
    totalTrades: trades.length
  });
});

app.listen(PORT, () => {
  console.log(`Quant Engine running at http://localhost:${PORT}`);
});