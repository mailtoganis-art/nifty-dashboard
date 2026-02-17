const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MARKET HOURS CHECK (IST)
========================= */

function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  const day = ist.getDay(); // 0=Sun, 6=Sat
  const hours = ist.getHours();
  const minutes = ist.getMinutes();

  if (day === 0 || day === 6) return false; // weekend

  const totalMinutes = hours * 60 + minutes;
  const marketStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;

  return totalMinutes >= marketStart && totalMinutes <= marketEnd;
}

/* =========================
   NIFTY DATA
========================= */

app.get("/api/nifty", async (req, res) => {
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d"
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Nifty fetch failed" });
  }
});

/* =========================
   VIX DATA
========================= */

app.get("/api/vix", async (req, res) => {
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?range=1d"
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "VIX fetch failed" });
  }
});

/* =========================
   INTELLIGENCE ENGINE
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

    const raw = await response.json();

    if (!raw.chart || !raw.chart.result || !raw.chart.result[0]) {
      return res.json({ error: "No market data available" });
    }

    const result = raw.chart.result[0];
    const meta = result.meta;
    const closes = result.indicators.quote[0].close.filter(v => v !== null);

    if (!closes || closes.length < 25) {
      return res.json({ error: "Insufficient candle data" });
    }

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;

    /* ===== EMA ===== */
    function ema(period, data) {
      const k = 2 / (period + 1);
      let emaVal = data[0];
      for (let i = 1; i < data.length; i++) {
        emaVal = data[i] * k + emaVal * (1 - k);
      }
      return emaVal;
    }

    const ema9 = ema(9, closes);
    const ema21 = ema(21, closes);

    /* ===== RSI ===== */
    function calculateRSI(data, period = 14) {
      let gains = 0;
      let losses = 0;

      for (let i = data.length - period; i < data.length - 1; i++) {
        const diff = data[i + 1] - data[i];
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }

      const rs = gains / (losses || 1);
      return 100 - 100 / (1 + rs);
    }

    const rsi = calculateRSI(closes);

    /* ===== TREND SLOPE ===== */
    const trendSlope =
      closes[closes.length - 1] - closes[closes.length - 6];

    /* ===== DECISION LOGIC ===== */
    let decision = "WAIT";
    let confidence = 50;

    if (ema9 > ema21 && rsi > 55 && trendSlope > 0) {
      decision = "CALL";
      confidence = 80;
    }
    else if (ema9 < ema21 && rsi < 45 && trendSlope < 0) {
      decision = "PUT";
      confidence = 80;
    }

    const suggestedEntry = currentPrice;

    const invalidationLevel =
      decision === "CALL"
        ? currentPrice - 20
        : decision === "PUT"
        ? currentPrice + 20
        : null;

    res.json({
      marketStatus: "OPEN",
      currentPrice,
      previousClose,
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      rsi: rsi.toFixed(2),
      trendSlope: trendSlope.toFixed(2),
      decision,
      confidence,
      suggestedEntry,
      invalidationLevel
    });

  } catch (err) {
    console.log("INTELLIGENCE ERROR:", err);
    res.status(500).json({ error: "Intelligence Engine Failed" });
  }
});

/* ========================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});