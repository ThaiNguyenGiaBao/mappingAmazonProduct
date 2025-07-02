const { getDb, close } = require("./database");
const { getAmazonProductsFromImageUrl } = require("./utils");
const { updateListingRestrictions } = require("./updateRestriction");

// Save the updated document back to the database
let db;
let collection;

async function completeMappingAmazonProducts(doc) {
  // Loop through each variant, fetch Amazon products if amazon_variant is empty
  for (const variant of doc.variants) {
    //console.log("Amazon variant:", variant.amazon_variant);
    if (variant.amazon_variant && variant.amazon_variant.length != 5) {
      console.log(
        `Variant ${variant.variant_property_value} already has Amazon products`
      );
      continue; // Skip if already mapped
    }

    const variantImage = variant.variant_image;
    const variantId = variant.variant_property_value;

    try {
      const mapVariant = await getAmazonProductsFromImageUrl(variantImage);
      if (mapVariant.length > 0) {
        console.log(
          `Found ${mapVariant.length} Amazon products for variant ${variantId}`
        );
        variant.amazon_variant = mapVariant; // Assign found products to the variant
      } else {
        console.log(`No Amazon products found for variant ${variantId}`);
      }
    } catch (err) {
      console.error(`Error fetching for variant ${variantId}:`, err);
    }
    updateListingRestrictions(variant, doc, collection);
    const result = await collection.updateOne(
      { _id: doc._id },
      { $set: { variants: doc.variants } }
    );
    console.log(
      `Updated ${doc._id}: matched=${result.matchedCount}, modified=${result.modifiedCount}`
    );
  }
}

async function main() {
  // 1) Ensure connection

  db = await getDb();
  collection = db.collection("amazon_product_mapping");
  aeDocs = await db
    .collection("amazon_product_mapping")
    .find({})
    .skip(0)
    .limit(100)
    .toArray();

  const jobs = aeDocs.map((doc) => completeMappingAmazonProducts(doc));
  await Promise.all(jobs);
}

main()
  .then(() => {
    console.log("✅ All products processed successfully");
    close().then(() => console.log("🔒 MongoDB connection closed"));
  })
  .catch((err) => {
    console.error("❌ Error in main():", err);
    process.exit(1);
  });
