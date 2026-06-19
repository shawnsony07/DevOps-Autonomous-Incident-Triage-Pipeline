// ❌ BUG: JSON.stringify on circular structure
export function serializeData(obj) {
  return JSON.stringify(obj);
}