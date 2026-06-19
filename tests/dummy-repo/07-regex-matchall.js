// ❌ BUG: matchAll requires global flag
export function extractTags(text) {
  const regex = /#[a-z]+/;
  return [...text.matchAll(regex)];
}