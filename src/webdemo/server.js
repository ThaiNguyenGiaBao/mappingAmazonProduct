// server.js
const express = require("express");
const { getDb, close } = require("../database");
const cors = require("cors");

async function createServer() {
  const app = express();

  app.use(
    cors({
      origin: "*", // Allow all origins for simplicity; adjust as needed
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const db = await getDb();
  const collection = db.collection("amazon_product_mapping");

  app.get("/proxy-image", async (req, res) => {
    const { url } = req.query;
    const response = await fetch(url);
    const contentType = response.headers.get("content-type");
    const arrayBuffer = await response.arrayBuffer();
    res.set("Content-Type", contentType);
    res.send(Buffer.from(arrayBuffer));
  });
  // GET /api/products?page=1&limit=20
  app.get("/api/products", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.max(1, parseInt(req.query.limit) || 10);
      const skip = (page - 1) * limit;

      // Fetch paginated data + total count
      const [data, total] = await Promise.all([
        collection.find({}).skip(skip).limit(limit).toArray(),
        collection.countDocuments(),
      ]);

      res.json({ page, limit, total, data });
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // start server
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });

  // clean up on exit
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, async () => {
      console.log("Shutting down...");
      await close();
      server.close(() => process.exit(0));
    });
  });
}

createServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
