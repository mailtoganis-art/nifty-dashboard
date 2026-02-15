const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));


// ===============================
// NIFTY LIVE DATA
// ===============================
app.get("/api/nifty", async (req, res) => {
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d"
    );
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Nifty fetch failed" });
  }
});


// ===============================
// INDIA VIX
// ===============================
app.get("/api/vix", async (req, res) => {
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?range=1d"
    );
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "VIX fetch failed" });
  }
});


// ===============================
// NEWS API
// ===============================
app.get("/api/news", async (req, res) => {
  try {
    const response = await fetch(
      "https://newsapi.org/v2/everything?q=stock%20market&sortBy=publishedAt&language=en&apiKey=a5f2b09345444435949c1855e366a59b"
    );
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "News fetch failed" });
  }
});


// ===============================
// 15-MIN BIAS ENGINE
// ===============================
app.get("/api/bias", async (req, res) => {

  // -------- Market Time Check (IST) --------
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  const day = ist.getDay(); // 0 Sunday
  const hours = ist.getHours();
  const minutes = ist.getMinutes();

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;
  const currentTime = hours * 60 + minutes;

  // Weekend
  if (day === 0 || day === 6) {
    return res.json({
      marketLive: false,
      message: "Market Closed (Weekend). Take rest."
    });
  }

  // Market hours
  if (currentTime < marketOpen || currentTime > marketClose) {
    return res.json({
      marketLive: false,
      message: "Market Closed. Trading hours 9:15 AM - 3:30 PM IST."
    });
  }

  try {

    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d"
    );
    const data = await response.json();

    const quotes = data.chart.result[0].indicators.quote[0];
    const closes = quotes.close.filter(v => v !== null).slice(-15);
    const highs = quotes.high.slice(-15);
    const lows = quotes.low.slice(-15);

    if (closes.length < 10) {
      return res.json({ bias: "WAIT", confidence: 0 });
    }

    // -------- EMA --------
    const ema = (period, arr) => {
      const k = 2 / (period + 1);
      let emaArr = [arr[0]];
      for (let i = 1; i < arr.length; i++) {
        emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k));
      }
      return emaArr;
    };

    const ema5 = ema(5, closes);
    const ema9 = ema(9, closes);

    // -------- RSI --------
    const calculateRSI = (arr, period = 7) => {
      let gains = 0, losses = 0;
      for (let i = arr.length - period; i < arr.length - 1; i++) {
        const diff = arr[i + 1] - arr[i];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const rs = gains / (losses || 1);
      return 100 - (100 / (1 + rs));
    };

    const rsi = calculateRSI(closes);

    // -------- Structure --------
    const last3 = closes.slice(-3);
    const bullishStructure = last3[2] > last3[1] && last3[1] > last3[0];
    const bearishStructure = last3[2] < last3[1] && last3[1] < last3[0];

    let bullScore = 0;
    let bearScore = 0;

    if (ema5.at(-1) > ema9.at(-1)) bullScore++;
    if (ema5.at(-1) < ema9.at(-1)) bearScore++;

    if (rsi > 55) bullScore++;
    if (rsi < 45) bearScore++;

    if (bullishStructure) bullScore++;
    if (bearishStructure) bearScore++;

    let bias = "WAIT";
    let confidence = 0;
    let entry = null;
    let stopLoss = null;
    let target = null;

    const recentHigh = Math.max(...highs.slice(-3));
    const recentLow = Math.min(...lows.slice(-3));

    if (bullScore >= 2) {
      bias = "CALL";
      confidence = Math.round((bullScore / 3) * 100);
      entry = recentHigh;
      stopLoss = recentLow;
      target = entry + (entry - stopLoss) * 1.5;
    } 
    else if (bearScore >= 2) {
      bias = "PUT";
      confidence = Math.round((bearScore / 3) * 100);
      entry = recentLow;
      stopLoss = recentHigh;
      target = entry - (stopLoss - entry) * 1.5;
    }

    res.json({
      marketLive: true,
      bias,
      confidence,
      rsi: rsi.toFixed(2),
      entry,
      stopLoss,
      target
    });

  } catch {
    res.status(500).json({ error: "Bias calculation failed" });
  }
});


// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});