// ❌ BUG: Passing a string to setTimeout instead of a function
export function delayAction() {
  setTimeout("console.log('done')", 1000);
}