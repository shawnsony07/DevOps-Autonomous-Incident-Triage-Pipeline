// ❌ BUG: Loop goes out of bounds (<= arr.length) causing undefined access
export function processArray(arr) {
  for (let i = 0; i <= arr.length; i++) {
    console.log(arr[i].toString());
  }
}