const spClient = require("../utils/getSPClient");
const axios = require("axios");
const { getDb, close } = require("../utils/database");
const dotenv = require("dotenv");
const { insertNewCategory } = require("./category");
dotenv.config();

const accessToken =
  "Atza|IwEBIARGl85GSvObW6KmoOocUGfGREjmohgBtbeXPGsaqTpSQcSzPlw4fkyy1lKTxQIr4HQ3VUWPydruy_TI67ZS4-QB2TJW-68mmyU1MRNQOTaTtBcCgRFByWixQer5kLK4BhVKk7Rs5g_TUBd9sJJKfe1ZNAcfGov1W_RTREKx0UramrZwwRSM-8DNRMuT-fpsl9tkFddEltDnTK5nS3fw_QBM6Kmzh2Yc-e-qWqV_-76T5Yx2HorarE06qbYaOFYYW_kALtKSdTbLNXHdTcF6O91qCoupBsdRx9uLjB9E20o068bVNUOO0uRFh69xV3aP5WLf2p30T6y5DqLCcxvjuDbM";
let collection;

const classification = {
  zopiClass: "Consumer Electronics",
  amazonClass: "Electronics",
  amazonClassId: "493964",
  maxPrice: 5200,
};

let productOptions = [];

async function saveToMongoDB(record) {
  const res = await collection.updateOne(
    { source_product_id: record.source_product_id },
    { $setOnInsert: record },
    { upsert: true }
  );

  if (res.upsertedCount === 1) {
    console.log(`✅ Saved new record with ASIN: ${record.source_product_id}`);
  } else {
    console.log(
      `⏭️  ASIN ${record.source_product_id} already exists; skipped.`
    );
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractListCategory(classificationsInput) {
  const result = [];

  const root = classificationsInput?.[0]?.classifications?.[0];
  if (!root) return result;

  let current = root;
  while (current) {
    result.push({ name: current.displayName, id: current.classificationId });
    current = current.parent;
  }

  return result;
}

async function searchCatalogItemsByAsinList(fullAsinList) {
  console.log("Searching catalog items by ASIN list:", fullAsinList.length);
  if (fullAsinList.length === 0) {
    console.log("No ASINs provided, skipping search.");
    return { variants: [], notNullDescription: null };
  }

  const baseUrl = "https://sellingpartnerapi-na.amazon.com";
  const path = "/catalog/2022-04-01/items";

  const allItems = [];
  const batches = chunkArray(fullAsinList, 20);

  let notNullDescription = null;

  for (const batch of batches) {
    console.log(`🔍 Fetching batch: ${batch.length}`);

    const queryParams = {
      marketplaceIds: "ATVPDKIKX0DER",
      includedData: [
        "attributes",
        "images",
        "classifications",
        "productTypes",
        "relationships",
      ],
      identifiersType: "ASIN",
      identifiers: batch.join(","),
      pageSize: 20,
    };

    try {
      const { data } = await axios({
        method: "GET",
        url: `${baseUrl}${path}?${new URLSearchParams(queryParams).toString()}`,
        headers: {
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
      });

      console.log(`✔️  Got ${data.items.length} items in this batch`);
      allItems.push(...data.items);
    } catch (error) {
      console.error(`❌ Error fetching batch: ${error.message}`);
      continue;
    }
  }

  const variants = allItems.map((item) => {
    const { variant_data, variantDescription } = transformVariantRecord(item);

    if (!notNullDescription) {
      notNullDescription = variantDescription;
    }
    return variant_data;
  });
  console.log(`✨ Total variants fetched: ${variants.length}`);
  return { variants, notNullDescription };
}

async function getCatalogItemByAsin(asin) {
  const baseUrl = "https://sellingpartnerapi-na.amazon.com";
  const path = "/catalog/2022-04-01/items/" + asin;
  let queryParams = {
    marketplaceIds: "ATVPDKIKX0DER",
    includedData: [
      "attributes",
      "images",
      "classifications",
      "productTypes",
      "relationships",
    ],
  };

  const { data } = await axios({
    method: "GET",
    url: baseUrl + path + "?" + new URLSearchParams(queryParams).toString(),
    headers: {
      "x-amz-access-token": accessToken,
    },
  });
  return data;
}

function transformVariantRecord(rec1) {
  const attr = rec1.attributes || {};

  let options =
    rec1.relationships?.[0]?.relationships?.[0]?.variationTheme?.attributes ||
    [];
  if (!options || options.length === 0) {
    options = productOptions;
    console.log(
      `⚠️ No variationTheme found for ASIN ${rec1.asin}, using productOptions`
    );
  }

  let mainImage = null;
  let maxWidth = 0;
  (rec1.images?.[0]?.images || []).forEach((img) => {
    if (img.variant === "MAIN" && img.width >= maxWidth) {
      mainImage = img.link;
      maxWidth = img.width;
    }
  });
  if (!mainImage) {
    console.log(
      `⚠️ No MAIN image found for ASIN ${rec1.asin}, using first available`
    );
  }

  const skuProps = [];
  options.forEach((opt) => {
    const value = attr[opt.toLowerCase()]?.[0]?.value ?? "null";
    skuProps.push({
      sku_property_id: opt,
      sku_property_name: opt,
      property_value_id_long: value,
      sku_property_value: value,
      sku_image: mainImage,
    });
  });

  let variantDescription = "";
  if (attr.product_description) {
    variantDescription = "<br>" + attr.product_description[0].value + "</br>";
  }

  if (attr.bullet_point) {
    variantDescription +=
      "<ul>" +
      (attr.bullet_point?.map((bp) => `<li>${bp.value}</li>`).join("") || "") +
      "</ul>";
  }

  return {
    variant_data: {
      sku_id: rec1.asin,
      price_usd: attr.list_price?.[0]?.value || null,
      quantity: 15,
      image: mainImage,
      sku_property: skuProps,
    },

    variantDescription: variantDescription,
  };
}

async function transformAmazonCatalogRecord(rec1) {
  const output = {
    source_product_id: rec1.asin,
    collection_path: [],
    created_at: new Date().toISOString(),
    description: null,
    full_asin: [],
    images: [],
    name: null,
    options: [],
    price_range: [],
    product_link: null,
    shipping_default: {},
    source_category_id: null,
    source_category_id_search: null,
    source_category_name: null,
    status: "full",
    store_info: {},
    updated_at: new Date().toISOString(),
    variants: [],
    item_specifics: [],
    sync_with_es_flag: false,
  };

  try {
    const rels = rec1.relationships?.[0]?.relationships?.[0];
    if (rels?.childAsins) {
      output.full_asin = rels.childAsins.slice();
    }
  } catch {}

  const attr = rec1?.attributes || {};

  const imgGroups = rec1.images?.[0]?.images || [];
  const urls = new Map();
  imgGroups.forEach((img) => {
    if (img.link) {
      if (urls.has(img.variant)) return;
      urls.set(img.variant, img.link);
    }
  });
  output.images = Array.from(urls.values()).map((link) => link);

  const nameAttr = attr.item_name?.[0]?.value;
  if (nameAttr) output.name = nameAttr;

  output.options =
    rec1.relationships?.[0]?.relationships?.[0]?.variationTheme.attributes ||
    [];
  productOptions = output.options;

  try {
    const classifications = extractListCategory(rec1.classifications);
    const idx = classifications.length >= 3 ? classifications.length - 3 : 0;
    output.source_category_id =
      classifications[idx]?.id || classification.amazonClassId;
    output.source_category_name =
      classifications[idx]?.name || classification.amazonClass;
    output.source_category_id_search = output.source_category_id;

    const catogory = {
      source_category_id: output.source_category_id,
      source_category_name: output.source_category_name,
      source_category_url: `https://www.amazon.com/b?node=${output.source_category_id}`,
      parent_ids: [
        classifications[classifications.length - 1]?.id ||
          classification.amazonClassId,
      ],
    };
    await insertNewCategory(catogory);
  } catch (err) {
    console.error("Error extracting category:", err);
  }

  if (attr.product_description) {
    output.description = "<br>" + attr.product_description[0].value + "</br>";
  }

  if (attr.bullet_point) {
    output.description =
      "<ul>" +
      (attr.bullet_point?.map((bp) => `<li>${bp.value}</li>`).join("") || "") +
      "</ul>";
  }

  const { variants, notNullDescription } = await searchCatalogItemsByAsinList(
    output.full_asin
  );

  if (!output.description) {
    output.description = notNullDescription;
    console.log(
      `No description found for ASIN ${rec1.asin}, using variant description `
    );
  }

  output.variants = variants;

  if (output.variants.length !== 0) {
    const minPrice = Math.min(...output.variants.map((v) => v.price_usd || -1));
    const maxPrice = Math.max(...output.variants.map((v) => v.price_usd || -1));
    output.price_range = [minPrice == -1 ? maxPrice : minPrice, maxPrice];
  } else {
    const price = attr.list_price?.[0]?.value || null;
    output.price_range = [price, price];
  }

  const dataSpecifics = [];
  Object.entries(attr).forEach(([key, value]) => {
    if (
      value[0]?.value == undefined ||
      value[0]?.value == "" ||
      key == "bullet_point"
    )
      return;
    dataSpecifics.push({
      name: key,
      value: value[0]?.value,
    });
  });

  output.item_specifics = [
    { blockTitle: "Item specifics", blockContent: dataSpecifics },
  ];

  output.product_link = `https://www.amazon.com/dp/${rec1.asin}`;

  output.shipping_default = null;
  output.store_info = {
    store_name: attr?.brand?.[0]?.value ?? "Generic",
    store_link: "",
  };

  return output;
}

async function searchCatalogItemsByKeywordAndClassificationIds(
  keyword,
  classificationIds,
  nextToken = null
) {
  console.log(
    `Searching catalog items for keyword: ${keyword}, classificationIds: ${classificationIds}`
  );
  const baseUrl = "https://sellingpartnerapi-na.amazon.com";
  const path = "/catalog/2022-04-01/items";
  let queryParams = {
    marketplaceIds: "ATVPDKIKX0DER",
    includedData: [
      "attributes",
      "images",
      "classifications",
      "productTypes",
      "relationships",
    ],
    pageSize: 20,
    keywords: keyword,
    classificationIds: classificationIds,
  };
  if (nextToken) {
    queryParams.pageToken = nextToken;
  }

  const { data } = await axios({
    method: "GET",
    url: baseUrl + path + "?" + new URLSearchParams(queryParams).toString(),
    headers: {
      "x-amz-access-token": accessToken,
    },
  });

  nextToken = data.pagination?.nextToken;

  return { nextToken, items: data.items || [] };
}

async function main() {
  const db = await getDb();
  collection = db.collection("amazon_products");

  let nextToken = null;
  do {
    const data = await searchCatalogItemsByKeywordAndClassificationIds(
      classification.zopiClass,
      [classification.amazonClassId],
      nextToken
    );
    nextToken = data.nextToken;

    console.log("Fetched items:", data.items.length);
    for (const amazonProduct of data.items) {
      console.log("Processing ASIN:", amazonProduct.asin);
      try {
        const parentAsin =
          amazonProduct.relationships?.[0].relationships?.[0]?.parentAsins?.[0];
        const existingRecord = await collection.findOne({
          source_product_id: parentAsin || amazonProduct.asin,
        });
        if (existingRecord) {
          console.log(
            `⏭️  ASIN ${existingRecord.source_product_id} already exists; skipped.`
          );
          continue;
        }
        let record;
        if (parentAsin) {
          console.log("Found parent ASIN:", parentAsin);
          product = await getCatalogItemByAsin(parentAsin);
          record = await transformAmazonCatalogRecord(product);
        } else {
          record = await transformAmazonCatalogRecord(amazonProduct);
        }
        if (record.price_range[1] > classification.maxPrice) {
          console.log(
            `⏭️  ASIN ${record.source_product_id} exceeds max price; skipped.`
          );
          continue;
        }

        await saveToMongoDB(record);
      } catch (error) {
        console.error("Error processing ASIN:", amazonProduct.asin, error);
      }
    }
  } while (nextToken);
}

main()
  .then(() => {
    console.log("Catalog items fetched successfully.");
  })
  .catch((error) => {
    console.error("Error fetching catalog items:", error);
  });
