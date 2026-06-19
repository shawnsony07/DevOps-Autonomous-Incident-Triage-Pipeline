// ❌ BUG: assumes data is always valid JSON
export function parseConfig(data) {
  return JSON.parse(data);
}