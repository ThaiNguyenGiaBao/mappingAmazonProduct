const { getDb, close } = require("./database");
const { getAmazonProductsFromImageUrl } = require("./utils");
const fs = require("fs").promises;
const path = require("path");

async function insertMappingAmazonProducts(doc) {
  const safeName = doc.name.replace(/[^a-zA-Z0-9_-]/g, "");
  const outputPath = path.resolve(__dirname, "mapped", safeName + ".json");

  const mappingProduct = {
    _id: doc._id,
    name: doc.name,
    product_link: doc.product_link,
    variants: [], // fill this in below
  };

  const isMapped = {};

  // for each variant, fetch Amazon products
  for (const variant of doc.variants) {
    const skuProp = variant.sku_property[0];
    console.log("Processing variant:", skuProp);
    const variantImage = skuProp.sku_image;
    const variantId = skuProp.sku_property_value;
    console.log(`Processing variant ${variantId} with image ${variantImage}`);

    if (!variantImage) {
      console.log(`Variant ${variantId} has no image`);
      continue;
    }

    if (isMapped[variantImage]) {
      console.log(
        `Variant ${variant.sku_property[0].sku_property_id} already mapped`
      );
      continue;
    }

    isMapped[variantImage] = true;

    // wait for your helper to complete
    var mapVariant;
    try {
      mapVariant = await getAmazonProductsFromImageUrl(variantImage);
    } catch (err) {
      console.error(`Error fetching for variant ${variantId}:`, err);
      continue;
    }

    if (mapVariant.length > 0) {
      console.log(
        `Found ${mapVariant.length} Amazon products for variant ${variantId}`
      );
    } else {
      console.log(`No Amazon products found for variant ${variantId}`);
    }

    // record this variant
    mappingProduct.variants.push({
      variant_property_value: variantId,
      variant_image: variantImage,
      amazon_variant: mapVariant,
    });
  }

  const line = JSON.stringify(mappingProduct) + "\n";

  await fs.appendFile(outputPath, line, "utf8");
}

async function main() {
  // 1) Ensure connection

  const db = await getDb();
  const aeDocs = await db
    .collection("ae_dropship_products")
    .find({})
    .skip(80)
    .limit(20)
    .toArray();

  //   const filePath = path.resolve(__dirname, "data.json");
  //   const raw = await fs.readFile(filePath, "utf8");
  //   let aeDocs = JSON.parse(raw);

  console.log("AE Docs:", aeDocs.length);

  const jobs = aeDocs.map((doc) => insertMappingAmazonProducts(doc));
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
