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

// ✅ Test input
const input = [
  {
    marketplaceId: "ATVPDKIKX0DER",
    classifications: [
      {
        displayName: "Place Mats",
        classificationId: "3742001",
        parent: {
          displayName: "Kitchen & Table Linens",
          classificationId: "1063916",
          parent: {
            displayName: "Kitchen & Dining",
            classificationId: "284507",
            parent: {
              displayName: "Categories",
              classificationId: "1063498",
              parent: {
                displayName: "Home & Kitchen",
                classificationId: "1055398",
              },
            },
          },
        },
      },
    ],
  },
];

console.log(extractListCategory(input));
