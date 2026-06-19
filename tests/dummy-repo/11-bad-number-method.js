// ❌ BUG: substring is a string method, not number
export function calculateAverage(total, count) {
  const avg = total / count;
  return avg.substring(0, 4);
}