import axios from 'axios';
// ❌ BUG: axios is not imported
export async function fetchData(url) {
  const response = await axios.get(url);
  return response.data;
}