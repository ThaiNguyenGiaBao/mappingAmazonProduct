function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractListCategory(classificationsInput) {
  const result = [];

  const root = classificationsInput?.[0]?.classifications?.[0];
  if (!root) return result;

  let current = root;
  while (current) {
    result.push({ name: current.displayName, id: current.classificationId });
    current = current.parent;
  }

  return result;
}


module.exports = {
  chunkArray,
  extractListCategory,
};
