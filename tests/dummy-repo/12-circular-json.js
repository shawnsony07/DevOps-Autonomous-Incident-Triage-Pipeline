// ❌ BUG: JSON.stringify on circular structure
export function serializeData(obj) {
  obj.self = obj;
  return JSON.stringify(obj);
}