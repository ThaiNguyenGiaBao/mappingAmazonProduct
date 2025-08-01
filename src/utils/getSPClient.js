const dotenv = require("dotenv");
dotenv.config();
const { SellingPartner } = require("amazon-sp-api");

const spClient = new SellingPartner({
  region: process.env.SPAPI_REGION || "na", // “na”/“eu”/“fe”
  refresh_token: process.env.LWA_REFRESH_TOKEN,

  credentials: {
    // pulled from env by you
    SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
    SELLING_PARTNER_APP_CLIENT_SECRET:
      process.env.SELLING_PARTNER_APP_CLIENT_SECRET,
  },
  options: {
    auto_request_tokens: true,
    auto_request_throttled: true,
    version_fallback: true,
    use_sandbox: false,
    only_grantless_operations: false,
    debug_log: false,
  },
});

module.exports = spClient;
