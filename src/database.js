// database.js
const { MongoClient } = require("mongodb");

// 1) Your connection URI
const uri =
  //"mongodb://ds-product-source:JNWZ5r87ZNbXWVw@192.168.91.29:27021/DropshipProducts?authSource=admin&readPreference=primary&directConnection=true&ssl=false";
  "mongodb+srv://thainguyengiabao27092004:awMvZMpA0Z9B4cls@cluster0.04q1y2b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
// 2) Create the client
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let dbInstance = null;

/**
 * Connects to MongoDB (only once) and returns the DB object.
 */
async function connect() {
  if (!dbInstance) {
    await client.connect();
    dbInstance = client.db("DropshipProducts");
    console.log("✅ MongoDB connected");
  }
  return dbInstance;
}

/**
 * Returns the DB object after connect() has been called.
 */
async function getDb() {
  if (!dbInstance) {
    await connect();
  }
  return dbInstance;
}

/**
 * Closes the MongoDB connection.
 */
async function close() {
  await client.close();
  dbInstance = null;
}

module.exports = {
  getDb,
  close,
};
