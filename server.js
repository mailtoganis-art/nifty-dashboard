const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));


// =======================
// MARKET STATUS FUNCTION
// =======================
function isMarketLive() {

  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  const day = ist.getDay(); // 0 = Sunday
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const currentTime = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  // ---- NSE Holidays 2026 (update yearly) ----
  const nseHolidays = [
    "2026-01-26",
    "2026-03-06",
    "2026-04-14",
    "2026-08-15",
    "2026-10-02",
    "2026-11-14"
  ];

  const todayStr = ist.toISOString().split("T")[0];

  if (day === 0 || day === 6) {
    return { live: false, message: "Market Closed (Weekend). Take rest." };
  }

  if (nseHolidays.includes(todayStr)) {
    return { live: false, message: "NSE Holiday Today. Market Closed." };
  }

  if (currentTime < marketOpen || currentTime > marketClose) {
    return { live: false, message: "Market Closed. Trading hours 9:15 AM - 3:30 PM IST." };
  }

  return { live: true };
}



// =======================
// NIFTY API
// =======================
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


// =======================
// VIX API
// =======================
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


// =======================
// NEWS API
// =======================
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


// =======================
// BIAS + ENTRY LOGIC
// =======================
app.get("/api/bias", async (req, res) => {

  const marketStatus = isMarketLive();

  if (!marketStatus.live) {
    return res.json({
      marketLive: false,
      message: marketStatus.message
    });
  }

  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d"
    );
    const data = await response.json();

    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close;
    const highs = result.indicators.quote[0].high;
    const lows = result.indicators.quote[0].low;

    const last10 = closes.slice(-10);

    const avg =
      last10.reduce((a, b) => a + b, 0) / last10.length;

    const last = last10[last10.length - 1];

    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];

    let bias = "WAIT";
    let entry = null;

    if (last > avg) {
      bias = "CALL SIDE BIAS";
      entry = lastHigh; // breakout level
    } else if (last < avg) {
      bias = "PUT SIDE BIAS";
      entry = lastLow; // breakdown level
    }

    res.json({
      marketLive: true,
      bias,
      entryLevel: entry,
      current: last
    });

  } catch (err) {
    res.status(500).json({ error: "Bias calculation failed" });
  }
});


// =======================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});