// Install dependency before running:
// npm install csv-parser

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { getListingRestrictions } = require("../utils/getRestriction"); // Adjust path as needed

const csvFilePath = path.resolve(__dirname, "products.csv"); // your CSV file

(async () => {
  try {
    // Create the CSV parsing stream
    const parser = fs.createReadStream(csvFilePath).pipe(csv());

    // Iterate rows one by one, awaiting each async check
    for await (const row of parser) {
      const asin = row.ASIN;
      console.log(asin);

      try {
        const { data } = await getListingRestrictions(asin);

        if (Array.isArray(data.restrictions) && data.restrictions.length > 0) {
          const code =
            data.restrictions[0]?.reasons?.[0]?.reasonCode || "UNKNOWN";
          console.log(`   • restriction for ${asin}: ${code}`);
        } else {
          console.log(`   • no restrictions for ${asin}`);
        }
      } catch (err) {
        console.error(
          `   ⚠️  error fetching restrictions for ${asin}:`,
          err.message || err
        );
      }
    }

    console.log("✅ All ASINs have been processed.");
  } catch (streamErr) {
    console.error(
      "Failed to read or parse CSV:",
      streamErr.message || streamErr
    );
  }
})();
