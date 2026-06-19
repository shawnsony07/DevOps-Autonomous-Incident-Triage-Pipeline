// ❌ BUG: Reassigning a const variable
export function updateCounter() {
  const count = 0;
  count++;
  return count;
}