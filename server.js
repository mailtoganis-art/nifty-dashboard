const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/nifty", async (req, res) => {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d");
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Nifty fetch failed" });
  }
});

app.get("/api/vix", async (req, res) => {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?range=1d");
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "VIX fetch failed" });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v1/finance/search?q=NIFTY&newsCount=5");
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "News fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
