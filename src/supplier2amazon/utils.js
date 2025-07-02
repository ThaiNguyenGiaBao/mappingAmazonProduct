const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");

const imageUrl = "https://ae01.alicdn.com/kf/UTB80pI5J5aMiuJk43PTq6ySmXXaS.jpg";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      protocolTimeout: 120_000,
      timeout: 120_000,
    });
  }
  return browserPromise;
}

async function getAmazonProductsFromImageUrl(imageUrl) {
  const amazonProductList = [];

  // 1. Download image
  const imagePath = path.resolve(__dirname, "image", imageUrl.split("/").pop());
  const file = fs.createWriteStream(imagePath);

  await new Promise((resolve, reject) => {
    https
      .get(imageUrl, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log("Image downloaded:", imagePath);
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(imagePath, () => {}); // Delete file if download fails
        reject(err);
      });
  });

  const browser = await getBrowser();
  // 2. Launch browser
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(120_000);

  page.on("response", async (response) => {
    if (!response.url().includes("https://www.amazon.com/stylesnap/upload"))
      return;

    let json;
    try {
      json = await response.json();
    } catch {
      console.log("  • <invalid JSON>");
      return;
    }

    const productScores = {};
    json.searchResults[0].subContent.forEach((entry) => {
      if (entry.contentType === "ASIN") {
        productScores[entry.content] = entry.properties?.score || "N/A";
      }
    });

    const productList = json.searchResults[0].bbxAsinMetadataList || [];
    productList.forEach((product) => {
      const processedProduct = {
        asin: product.asin,
        score:
          typeof product.score === "number"
            ? product.score
            : parseFloat(product.score) || 0,
        title: product.title || "N/A",
        imageUrl: product.imageUrl || "N/A",
        averageOverallRating: product.averageOverallRating || "N/A",
        totalReviewCount: product.totalReviewCount || " N/A",
        score: productScores[product.asin] || "N/A",
      };
      amazonProductList.push(processedProduct);
    });
  });

  // 3. Go to page and upload
  await page.goto("https://www.amazon.com/shopthelook", {
    waitUntil: "networkidle0",
  });

  await page.waitForSelector("#a-autoid-0-announce");
  await page.click("#a-autoid-0-announce");

  const input = await page.$("input#file");
  console.log("Uploading file:", imagePath);
  await input.uploadFile(imagePath);

  await page.waitForNavigation({ waitUntil: "networkidle0" });

  // 4. Delete downloaded image
  try {
    fs.unlinkSync(imagePath);
    console.log("Image deleted:", imagePath);
  } catch (err) {
    console.error("Error deleting image:", err.message);
  }

  if (amazonProductList.length === 0) {
    console.log("No products found.");
  } else {
    console.log("Found products:", amazonProductList.length);
  }
  await page.close();
  return amazonProductList.sort((a, b) => b.score - a.score);
}

//getAmazonProductsFromImageUrl(imageUrl);

module.exports = { getAmazonProductsFromImageUrl };
