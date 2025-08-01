const { getDb, close } = require("../utils/database");

async function insertNewCategory(category) {
  const db = await getDb();
  const collection = db.collection("anazon_categories");

  // Check if the category already exists
  const existingCategory = await collection.findOne({
    id: category.id,
  });

  if (!existingCategory) {
    await collection.insertOne(category);
    console.log(`Inserted new category: ${category}`);
  }
}

module.exports = {
  insertNewCategory,
};
