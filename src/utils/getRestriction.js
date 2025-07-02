const axios = require("axios");
const Bottleneck = require("bottleneck");
const dotenv = require("dotenv");
const { getDb, close } = require("./database");

dotenv.config();
const baseUrl = "https://sellingpartnerapi-na.amazon.com";

// 1) Create our Bottleneck limiter
const limiter = new Bottleneck({
  minTime: 220, // ≥200ms between calls → ≤5 rps
  maxConcurrent: 1, // one at a time
  reservoir: 5, // initial burst
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 1000, // refill every second
});

// 2) Retry logic on 429
limiter.on("failed", async (error, jobInfo) => {
  if (error.response?.status === 429 && jobInfo.retryCount < 5) {
    const delay = 2 ** jobInfo.retryCount * 100; // 100ms, 200ms, 400ms...
    console.warn(
      `429 received – retry #${jobInfo.retryCount + 1} in ${delay}ms`
    );
    return delay;
  }
});

// 3) Your original fetch, now wrapped by Bottleneck
async function _getListingRestrictions(
  asin,
  {
    sellerId = "A9AH9E9C6DY7G",
    marketplaceIds = ["ATVPDKIKX0DER"],
    conditionType = "new_new",
    reasonLocale = "en_US",
  } = {}
) {
  const path = "/listings/2021-08-01/restrictions";
  const qp = new URLSearchParams({
    reasonLocale,
    asin,
    sellerId,
    marketplaceIds: marketplaceIds.join(","),
    conditionType,
  });
  const url = `${baseUrl}${path}?${qp}`;

  // NOTE: you must fill in these with your SigV4 + LWA
  const headers = {
    "x-amz-access-token":
      "Atza|IwEBIGHLcXdBwgV_KvL2QqakXQaXbYf1upcoXQyrjyvHi9sEPfIwn_bNYtUPLt1UCXibMqvEqk0oPpPpVx03sDt2Rjm6acUERBm7DtzbcevAIg8bbF1UgBhR0Tf2RemuVrMygIYgBfjyt4CoTWlbxA9vpzgxq_a0IDbb1okK4dWLaUREuO7_QmbpurWjfNEDYUmga8snL6s99ylShB4WlQD6LZUD_QRGDZX3vWtB9hTgyb9uLn0B9rTFw-HAL-peAWluAjo4WY9vsvvBR1qp4hufqZarTG1Bg_70hh1yX6nmttMEn725VqbZlCm4PAO0Ce71rZYcXRhmWenCTIJ3ipqymUEbLwnDxFXKDS0d9b-fOQnI9w",

    "Content-Type": "application/json",
  };

  const resp = await axios.get(url, { headers });
  return {
    asin,
    data: resp.data,
  };
}

module.exports = {
  getListingRestrictions: limiter.wrap(_getListingRestrictions),
};
