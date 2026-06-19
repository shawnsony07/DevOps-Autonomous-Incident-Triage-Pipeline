// ❌ BUG: Using negative index in array
export function getLastElement(arr) {
  return arr[arr.length - 1].id;
}