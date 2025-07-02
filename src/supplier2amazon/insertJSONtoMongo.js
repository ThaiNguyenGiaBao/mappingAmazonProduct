
// insertJSONtoMongo.js
const path = require('path');
const fs = require('fs').promises;
const { getDb, close } = require('./database');

async function main() {
  const db = await getDb();
  const collection = db.collection('amazon_product_mapping');

  const mappedDir = path.resolve(__dirname, 'mapped');
  let files;
  try {
    files = await fs.readdir(mappedDir);
  } catch (err) {
    console.error(`Failed to read directory ${mappedDir}:`, err);
    await close();
    process.exit(1);
  }

  const docs = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(mappedDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const doc = JSON.parse(content);
      docs.push(doc);
      console.log(`Loaded ${file}`);
    } catch (err) {
      console.error(`Error reading or parsing ${file}:`, err);
    }
  }

  if (docs.length === 0) {
    console.log('No JSON documents to insert.');
  } else {
    try {
      const result = await collection.insertMany(docs);
      console.log(`Inserted ${result.insertedCount} documents into amazon_product_mapping.`);
    } catch (err) {
      console.error('Error inserting documents:', err);
    }
  }

  await close();
}

main().catch(err => {
  console.error('Unexpected error:', err);
  close();
});
