function transformVariantRecord(rec1, productOptions) {
  const attr = rec1.attributes || {};

  let options =
    rec1.relationships?.[0]?.relationships?.[0]?.variationTheme?.attributes ||
    [];
  if (!options || options.length === 0) {
    options = productOptions;
    console.log(
      `⚠️ No variationTheme found for ASIN ${rec1.asin}, using productOptions`
    );
  }

  let mainImage = null;
  let maxWidth = 0;
  (rec1.images?.[0]?.images || []).forEach((img) => {
    if (img.variant === "MAIN" && img.width >= maxWidth) {
      mainImage = img.link;
      maxWidth = img.width;
    }
  });
  if (!mainImage) {
    console.log(
      `⚠️ No MAIN image found for ASIN ${rec1.asin}, using first available`
    );
  }

  const skuProps = [];
  options.forEach((opt) => {
    const value = attr[opt.toLowerCase()]?.[0]?.value ?? "null";
    skuProps.push({
      sku_property_id: opt,
      sku_property_name: opt,
      property_value_id_long: value,
      sku_property_value: value,
      sku_image: mainImage,
    });
  });

  return {
    sku_id: rec1.asin,
    price_usd: attr.list_price?.[0]?.value || null,
    quantity: 15,
    image: mainImage,
    sku_property: skuProps,
  };
}

module.exports = {
  transformVariantRecord,
};
