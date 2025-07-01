const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");

const imageUrl = "https://ae01.alicdn.com/kf/UTB80pI5J5aMiuJk43PTq6ySmXXaS.jpg";




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

  // 2. Launch browser
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // page.on("request", (request) => {
  //   if (["xhr", "fetch"].includes(request.resourceType())) {
  //     console.log(
  //       `→ REQUEST [${request
  //         .resourceType()
  //         .toUpperCase()}] ${request.method()} ${request.url()}`
  //     );
  //     const postData = request.postData();
  //     if (postData) console.log(`  • payload: ${postData}`);
  //   }
  // });

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

  // 5. Close browser
  await browser.close();

  if (amazonProductList.length === 0) {
    console.log("No products found.");
  } else {
    console.log("Found products:", amazonProductList.length);
  }

  return amazonProductList.sort((a, b) => b.score - a.score).slice(0, 5); // Keep top 10 products
}

//getAmazonProductsFromImageUrl(imageUrl);

module.exports = { getAmazonProductsFromImageUrl };
