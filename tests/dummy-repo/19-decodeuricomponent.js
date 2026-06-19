// ❌ BUG: decodeURIComponent throws on malformed URI
export function parseUrlQuery(query) {
  return decodeURIComponent(query);
}