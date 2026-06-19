// ❌ BUG: Trying to use .map on an object
export function extractNames(usersObj) {
  return usersObj.map(u => u.name);
}