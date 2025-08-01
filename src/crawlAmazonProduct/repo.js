const { getDb, close } = require("../utils/database");

class ProductRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async upsert(record) {
    const res = await this.collection.updateOne(
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

  async exists(sourceId) {
    return await this.collection.findOne({ source_product_id: sourceId });
  }

  async findBySourceId(sourceId) {
    return await this.collection.findOne({ source_product_id: sourceId });
  }
}

async function getProductRepository() {
  const db = await getDb();
  const collection = db.collection("amazon_products");
  return new ProductRepository(collection);
}

module.exports = {
  getProductRepository,
  ProductRepository,
};
