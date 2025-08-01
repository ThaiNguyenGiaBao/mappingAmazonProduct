const axios = require("axios");
const { getDb, close } = require("../utils/database");
let db;

async function getAcceptedAmazonVariants(skip = 0, limit = 100) {
  const collection = db.collection("amazon_product_mapping");

  const pipeline = [
    // 1) Flatten to one doc per variant
    { $unwind: "$variants" },

    // 2) Flatten to one doc per amazon_variant
    { $unwind: "$variants.amazon_variant" },

    // 3) Filter only those with restriction=ACCEPTED and numeric score<0.8
    {
      $match: {
        "variants.amazon_variant.restriction": "ACCEPTED",
        $expr: {
          $and: [
            {
              $regexMatch: {
                input: "$variants.amazon_variant.score",
                regex: /^[0-9]+(\.[0-9]+)?$/,
              },
            },
            {
              $lt: [{ $toDouble: "$variants.amazon_variant.score" }, 0.8],
            },
          ],
        },
      },
    },

    // 4) Project away everything but the amazon_variant sub-document
    {
      $replaceRoot: { newRoot: "$variants.amazon_variant" },
    },

    // 5) Pagination
    { $skip: skip },
    { $limit: limit },
  ];

  const variants = await collection.aggregate(pipeline).toArray();
  console.log(`Found ${variants.length} matching amazon variants.`);
  return variants;
}

async function getSupplierProductFromImageUrl(imageUrl, threshold = 0.7) {
  //https://researcher-ai.staging.zopi.io/products/product-matching?image_url=https%3A%2F%2Fm.media-amazon.com%2Fimages%2FI%2F41S5l230lmL.jpg&threshold=0.8
  const response = await axios.get(
    "https://researcher-ai.staging.zopi.io/products/product-matching",
    {
      params: {
        image_url: imageUrl,
        threshold: threshold,
      },
    }
  );
  return response.data.map((item) => {
    return {
      source: item.source,
      image: item.image,
      image_score: item.image_score,
      source_product_id: item.source_product_id,
      source_variant_id: item.source_variant_id,
    };
  });
}

async function saveToMongoDB(record) {
  const collection = db.collection("amazon2supplier");
  // Check if the record already exists
  const res = await collection.updateOne(
    { asin: record.asin },
    { $setOnInsert: record },
    { upsert: true }
  );

  if (res.upsertedCount === 1) {
    console.log(`✅ Saved new record with ASIN: ${record.asin}`);
  } else {
    console.log(`⏭️  ASIN ${record.asin} already exists; skipped.`);
  }
}

async function main() {
  db = await getDb();

  //   const amazonProducts = await getAcceptedAmazonVariants(100, 500);
  //   console.log(amazonProducts.length, "Amazon products found.");

  //   const jobs = amazonProducts.map(async (product) => {
  //     //console.log("Processing product:", product.asin);
  //     const imageUrl = product.imageUrl;
  //     const supplierProducts = await getSupplierProductFromImageUrl(imageUrl);

  //     const record = {
  //       ...product,
  //       supplier_products: supplierProducts.slice(0, 5),
  //     };
  //     //console.log("Record to save:", record);
  //     await saveToMongoDB(record);
  //   });
  //   await Promise.all(jobs);

  const collection = db.collection("amazon2supplier");

  const count = await collection.countDocuments({
    "supplier_products.image_score": { $gt: 0.9 },
  });

  console.log(`Products with at least one image_score > 0.9: ${count}`);
}

main()
  .then(() => {
    console.log("Finished fetching Amazon products.");
    close().then(() => {
      console.log("Database connection closed.");
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("Error fetching Amazon products:", err);
    process.exit(1);
  });
