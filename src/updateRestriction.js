const axios = require("axios");
const Bottleneck = require("bottleneck");
const dotenv = require("dotenv");
const { getDb, close } = require("./database");

dotenv.config();
const baseUrl = "https://sellingpartnerapi-na.amazon.com";

// 1) Create our Bottleneck limiter
const limiter = new Bottleneck({
  minTime: 220, // ≥200ms between calls → ≤5 rps
  maxConcurrent: 1, // one at a time
  reservoir: 5, // initial burst
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 1000, // refill every second
});

// 2) Retry logic on 429
limiter.on("failed", async (error, jobInfo) => {
  if (error.response?.status === 429 && jobInfo.retryCount < 5) {
    const delay = 2 ** jobInfo.retryCount * 100; // 100ms, 200ms, 400ms...
    console.warn(
      `429 received – retry #${jobInfo.retryCount + 1} in ${delay}ms`
    );
    return delay;
  }
});

// 3) Your original fetch, now wrapped by Bottleneck
async function _getListingRestrictions(
  asin,
  {
    sellerId = "A9AH9E9C6DY7G",
    marketplaceIds = ["ATVPDKIKX0DER"],
    conditionType = "new_new",
    reasonLocale = "en_US",
  } = {}
) {
  const path = "/listings/2021-08-01/restrictions";
  const qp = new URLSearchParams({
    reasonLocale,
    asin,
    sellerId,
    marketplaceIds: marketplaceIds.join(","),
    conditionType,
  });
  const url = `${baseUrl}${path}?${qp}`;

  // NOTE: you must fill in these with your SigV4 + LWA
  const headers = {
    "x-amz-access-token": process.env.LWA_ACCESS_TOKEN,

    "Content-Type": "application/json",
  };

  const resp = await axios.get(url, { headers });
  return {
    asin,
    data: resp.data,
  };
}

// wrap it
const getListingRestrictions = limiter.wrap(_getListingRestrictions);

async function updateListingRestrictions(variant, doc, col) {
  for (const av of variant.amazon_variant) {
    if (!av.asin) {
      console.log(`No ASIN for variant ${variant.variant_property_value}`);
      continue;
    }
    console.log(`→ fetching restrictions for ${av.asin}`);
    const { data, asin } = await getListingRestrictions(av.asin);

    if (data.restrictions.length === 0) {
      av.restriction = "ACCEPTED";
      console.log(`   • no restrictions for ${asin}`);
    } else {
      const code = data.restrictions[0].reasons[0].reasonCode;
      av.restriction = code;
      console.log(`   • restriction for ${asin}: ${code}`);
    }
  }

  const result = await col.updateOne(
    { _id: doc._id },
    { $set: { variants: doc.variants } }
  );
  console.log(
    `↳ updated ${doc._id}: matched=${result.matchedCount}, modified=${result.modifiedCount}`
  );
}

(async () => {
  try {
    const db = await getDb();
    const col = db.collection("amazon_product_mapping");
    const docs = await col.find({}).skip(0).limit(5).toArray();
    console.log(`Processing ${docs.length} docs…`);

    for (const doc of docs) {
      const tasks = doc.variants.map((variant) => {
        if (!variant.amazon_variant?.length) {
          console.log(`No variants for ${variant.variant_property_value}`);
          return Promise.resolve();
        }
        return updateListingRestrictions(variant, doc, col);
      });
      await Promise.all(tasks).catch((err) => {
        console.log(`Error processing doc ${doc._id}:`, err.message);
      });
    }

    await close();
    console.log("🔒 MongoDB connection closed");
  } catch (err) {
    console.log("Fatal error:", err.response?.status, err.message);
  }
})();
