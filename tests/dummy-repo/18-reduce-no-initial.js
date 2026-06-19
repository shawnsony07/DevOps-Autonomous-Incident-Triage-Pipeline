// ❌ BUG: reduce on empty array with no initial value
export function sumEmptyArray(arr) {
  return arr.reduce((a, b) => a + b);
}