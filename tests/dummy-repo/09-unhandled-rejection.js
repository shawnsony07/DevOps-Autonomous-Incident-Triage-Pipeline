// ❌ BUG: No try/catch around async call that throws
export async function handler(apiClient) {
  const data = await apiClient.fetchImportantData();
  return data.toUpperCase();
}