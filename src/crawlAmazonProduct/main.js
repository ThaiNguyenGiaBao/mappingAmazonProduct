const axios = require("axios");
const dotenv = require("dotenv");

const { insertNewCategory } = require("./category");
const {transformProductRecord} = require("./productAdapter");

const { getProductRepository } = require("./repo");
let productRepository = null;

const accessToken =
  "Atza|IwEBIDACdMiCe0htlEBn5lHxaPQ5NtDC1VdQT17iksEelN76CQVBkA6xXxADJm_ZKPAuDpsFl-yjISgk1SrdzwAFg7LRWbwZuXxVz_kKxBE9M23UlXg9LaHA7qv6nKu8Sb7NrpZZ8ZZgqUBUwEoI-phResHy9bW-JqxCOpUGx5ckbnNIEuMIYI41pw3Y_5XVkNjNlN5RW3gM50DOryzXq0-o8SxkrWJjGkmw5DcO3lFVBPzqN3DtB4-o5miFNESahlK4Royrqma1nhy3uIVTUZvmtONPX1fjIGBgj7w8ZXbDSuveysFTcRx5N6hPgTmPhGcDIR3Hr88OtIZQ0jVgTIxlsri2";

const classification = {
  zopiClass: "Consumer Electronics",
  amazonClass: "Electronics",
  amazonClassId: "493964",
  maxPrice: 5200,
};



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

async function processProduct(amazonProduct) {
  console.log("Processing ASIN:", amazonProduct.asin);
  try {
    const parentAsin =
      amazonProduct.relationships?.[0].relationships?.[0]?.parentAsins?.[0];
    const existingRecord = await productRepository.findBySourceId(
      parentAsin || amazonProduct.asin
    );

    if (existingRecord) {
      console.log(
        `⏭️  ASIN ${existingRecord.source_product_id} already exists; skipped.`
      );
      return;
    }

    let record;
    if (parentAsin) {
      console.log("Found parent ASIN:", parentAsin);
      product = await getCatalogItemByAsin(parentAsin);
      record = await transformProductRecord(product);
    } else {
      record = await transformProductRecord(amazonProduct);
    }

    if (record.price_range[1] > classification.maxPrice) {
      console.log(
        `⏭️  ASIN ${record.source_product_id} exceeds max price; skipped.`
      );
      return;
    }

    await productRepository.upsert(record);
  } catch (error) {
    console.error("Error processing ASIN:", amazonProduct.asin, error);
  }
}

async function main() {
  let nextToken = null;
  if (!productRepository) {
    productRepository = await getProductRepository();
  }
  do {
    const data = await searchCatalogItemsByKeywordAndClassificationIds(
      classification.zopiClass,
      [classification.amazonClassId],
      nextToken
    );
    nextToken = data.nextToken;

    for (const amazonProduct of data.items) {
      await processProduct(amazonProduct);
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
