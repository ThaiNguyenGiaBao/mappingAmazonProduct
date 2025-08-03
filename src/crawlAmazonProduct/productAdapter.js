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

class ProductAdapter {
  constructor(raw, classification) {
    this.raw = raw;
    this.attr = raw.attributes || {};
    this.rels = raw.relationships?.[0]?.relationships?.[0] || {};
    this.classification = classification;
  }

  getFullAsin() {
    return this.raw.relationships?.[0]?.relationships?.[0]?.childAsins || [];
  }

  getImages() {
    const groups = this.raw.images?.[0]?.images || [];
    const seen = new Set();
    return groups
      .filter(
        ({ variant, link }) => link && !seen.has(variant) && seen.add(variant)
      )
      .map((img) => img.link);
  }

  getDescription(variantsData = []) {
    let description = null;

    if (this.attr.product_description) {
      description = `<br>${this.attr.product_description[0].value}</br>`;
    }
    if (this.attr.bullet_point) {
      description += `<ul>${this.attr.bullet_point
        .map((bp) => `<li>${bp.value}</li>`)
        .join("")}</ul>`;
    }
    if (description) return description;

    // fallback to variants
    let variantDescription = null;
    for (const v of variantsData) {
      const bp = v.attributes?.bullet_point;
      if (bp)
        variantDescription = `<ul>${bp
          .map((b) => `<li>${b.value}</li>`)
          .join("")}</ul>`;
      if (v.attributes?.product_description) {
        variantDescription += `<br>${v.attributes.product_description[0].value}</br>`;
      }
    }

    if (!variantDescription) {
      console.log("⚠️ No description found, using attributes");
    }

    return variantDescription;
  }

  async getVariants(variantsDataRaws) {
    return variantsDataRaws.map((item) =>
      transformVariantRecord(item, this.getOptions())
    );
  }

  getOptions() {
    return this.rels.variationTheme?.attributes || [];
  }

  getPriceRange(variants) {
    const prices = variants.map((v) => v.price_usd).filter((p) => p !== null);

    if (prices.length != 0) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return [minPrice, maxPrice];
    }

    const p = this.attr.list_price?.[0]?.value || null;
    return [p, p];
  }

  getSpecifics() {
    const specifics = [];
    Object.entries(this.attr).forEach(([key, value]) => {
      if (value[0]?.value == undefined || value[0]?.value == "") return;
      specifics.push({
        name: key,
        value: value[0].value,
      });
    });
    return [{ blockTitle: "Item specifics", blockContent: specifics }];
  }

  getSourceCategory() {
    const list = Array.isArray(this.raw.classifications)
      ? extractListCategory(this.raw.classifications)
      : [];
    const idx = list.length >= 3 ? list.length - 3 : 0;
    const id = list[idx]?.id || this.classification.amazonClassId;
    const name = list[idx]?.name || this.classification.amazonClass;
    return { id, name };
  }

  getStoreInfo() {
    return {
      store_name: this.attr.brand?.[0]?.value || "Generic",
      store_link: this.attr.brand?.[0]?.value
        ? `https://www.amazon.com/s?k=${encodeURIComponent(
            this.attr.brand[0].value
          )}`
        : "",
    };
  }

  async updateCategory(id, name) {
    const classifications = extractListCategory(this.raw.classifications || []);
    const category = {
      source_category_id: id,
      source_category_name: name,
      source_category_url: `https://www.amazon.com/b?node=${id}`,
      parent_ids: [
        classifications[classifications.length - 1]?.id ||
          this.classification.amazonClassId,
      ],
    };
    return insertNewCategory(category);
  }

  getName() {
    return this.attr.item_name?.[0]?.value;
  }

  async transform() {
    const output = {
      source_product_id: this.raw.asin,
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

    output.full_asin = this.getFullAsin();
    output.images = this.getImages();

    output.name = this.getName();

    output.options = this.getOptions();

    const { id, name } = this.getSourceCategory();
    output.source_category_id = id;
    output.source_category_name = name;
    output.source_category_id_search = id;

    this.updateCategory(id, name);

    const allItems = await searchCatalogItemsByAsinList(output.full_asin);
    console.log(`✨ Total variants fetched: ${allItems.length}`);

    output.description = this.getDescription(allItems);

    output.variants = await this.getVariants(allItems);

    output.price_range = this.getPriceRange(output.variants);

    output.item_specifics = this.getSpecifics();

    output.product_link = `https://www.amazon.com/dp/${this.raw.asin}`;

    output.shipping_default = null;

    output.store_info = this.getStoreInfo();

    return output;
  }
}

module.exports = {
  searchCatalogItemsByAsinList,
  ProductAdapter,
};
