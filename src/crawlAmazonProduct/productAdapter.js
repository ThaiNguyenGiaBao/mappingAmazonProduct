const axios = require("axios");
const { insertNewCategory } = require("./category");
const { extractListCategory, chunkArray } = require("./utils");
const { transformVariantRecord } = require("./variantAdater");

const accessToken =
  "Atza|IwEBIB9Y0yFygW2ABC7-dZ_kSI28i5WMt1NpuF-1AoVVziOgnTfHEVzCU1XwgM43cDHmg47QdDBm-0ohQjdYaruI6sT3BeRUMbfm_ARE5tezCu8vgtQY4OX8BLoAeTsNvzCcOixvredtavKm66exyzKGsbpSy7dhqutJYGiZmunfvW9nwowAzoUel-OTSz7_vKT7KjkGJCRgmfOECSs2zESIuro0kWJC7Ouxao8qQIyvaWNo53TCvptBlCRoIOQ79FdJDu91HnFr00nNzXSvbEEgxExm6_7mz-UYY6w06CC56F1vIDvcxxgO5ucfaFu7AcX9EA_L_YDxkNn05n60F6Dy1NAa";

async function searchCatalogItemsByAsinList(fullAsinList) {
  console.log("Searching catalog items by ASIN list:", fullAsinList.length);
  if (fullAsinList.length === 0) {
    console.log("No ASINs provided, skipping search.");
    return [];
  }

  const baseUrl = "https://sellingpartnerapi-na.amazon.com";
  const path = "/catalog/2022-04-01/items";

  const allItems = [];
  const batches = chunkArray(fullAsinList, 20);

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

  return allItems;
}

async function transformProductRecord(rec1) {
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

  const allItems = await searchCatalogItemsByAsinList(output.full_asin);
  const variants = allItems.map((item) => {
    return transformVariantRecord(item, output.options);
  });
  console.log(`✨ Total variants fetched: ${variants.length}`);

  if (!output.description) {
    console.log("=> No description found, using attributes");
    allItems.forEach((item) => {
      if (item.attributes?.product_description) {
        output.description =
          "<br>" + item.attributes.product_description[0].value + "</br>";
      }
      if (item.attributes?.bullet_point) {
        output.description =
          "<ul>" +
          (item.attributes.bullet_point
            ?.map((bp) => `<li>${bp.value}</li>`)
            .join("") || "") +
          "</ul>";
      }
    });
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

module.exports = {
  searchCatalogItemsByAsinList,
  transformProductRecord,
};
