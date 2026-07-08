export interface BarExtra {
  id: string;
  name: string;
  group_label: string;
  is_single: boolean;
  price_mxn: number;
}

export interface PricedExtras {
  snapshot: { id: string; name: string; price: number }[];
  total: number;
}

export function priceSelectedExtras(selectedIds: string[], catalog: BarExtra[]): PricedExtras {
  // Dedup selectedIds using Set
  const uniqueIds = new Set(selectedIds);

  // Build snapshot from ids that exist in catalog
  const snapshot: { id: string; name: string; price: number }[] = [];
  let sum = 0;

  for (const id of uniqueIds) {
    const item = catalog.find((extra) => extra.id === id);
    if (item) {
      snapshot.push({
        id: item.id,
        name: item.name,
        price: item.price_mxn,
      });
      sum += item.price_mxn;
    }
  }

  // Round total to 2 decimals: Math.round(sum * 100) / 100
  const total = Math.round(sum * 100) / 100;

  return { snapshot, total };
}
