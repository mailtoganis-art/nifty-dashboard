const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIG
// ===============================

// 🔁 Replace later with real API
const DATA_URL = process.env.DATA_URL || null;

const LOG_FILE = "trade_log.csv";

// ===============================
// SAFE STARTUP
// ===============================

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(
    LOG_FILE,
    "timestamp,signal,confidence,regime,entryPrice,outcome\n"
  );
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
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

    trs.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
    );
  }
  return mean(trs.slice(-period));
}

function VWAP(candles) {
  let cumPV = 0;
  let cumVol = 0;

  candles.forEach(c => {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumPV += typical * vol;
    cumVol += vol;
  });

  return cumPV / cumVol;
}

// ===============================
// ANALYSIS ENGINE
// ===============================

function analyzeMarket(candles) {
  const last20 = candles.slice(-20);
  const closes = last20.map(c => c.close);

  const current = last20[last20.length - 1];
  const price = current.close;

  const atr = ATR(last20);
  const avgRange = mean(last20.map(c => c.high - c.low));
  const volatilityRatio = atr / avgRange;

  let regime = "RANGE";
  if (volatilityRatio > 1.2) regime = "VOLATILE";
  if (volatilityRatio < 0.8) regime = "COMPRESSION";

  const emaFast = EMA(closes, 5);
  const emaSlow = EMA(closes, 15);
  const slope = emaFast - emaSlow;

  const z = (price - mean(closes)) / stdDev(closes);
  const vwap = VWAP(last20);
  const vwapDev = (price - vwap) / atr;

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

// ===============================
// DATA FETCH (SAFE MODE)
// ===============================

async function fetchCandles() {
  try {
    if (!DATA_URL) throw new Error("No DATA_URL set");

    const response = await axios.get(DATA_URL);
    return response.data;
  } catch (err) {
    // FALLBACK SAFE MOCK DATA
    console.log("Using mock data mode");

    return Array.from({ length: 30 }).map(() => ({
      high: 22000 + Math.random() * 50,
      low: 21950 + Math.random() * 50,
      close: 21975 + Math.random() * 50,
      volume: 1000 + Math.random() * 500
    }));
  }
}

// ===============================
// ROUTES
// ===============================

// Health Check
app.get("/", (req, res) => {
  res.send("Quant Engine Running Successfully");
});

// Analysis Route
app.get("/analysis", async (req, res) => {
  try {
    const candles = await fetchCandles();
    const result = analyzeMarket(candles);

    if (result.signal !== "WAIT") {
      const line = `${new Date().toISOString()},${result.signal},${result.confidence},${result.regime},${result.price},PENDING\n`;
      fs.appendFileSync(LOG_FILE, line);
    }

    res.json(result);

  } catch (err) {
    res.status(500).json({ error: "Analysis failed" });
  }
});

// Performance Route
app.get("/performance", (req, res) => {
  const data = fs.readFileSync(LOG_FILE, "utf8").split("\n").slice(1);
  const trades = data.filter(row =>
    row.includes("CALL") || row.includes("PUT")
  );

  res.json({
    totalTrades: trades.length
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`Quant Engine running on port ${PORT}`);
});