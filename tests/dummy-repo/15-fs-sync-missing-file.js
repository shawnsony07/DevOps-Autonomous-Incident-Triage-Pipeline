import fs from 'fs';
// ❌ BUG: Using fs.readFileSync on a missing file without try/catch
export function loadConfig() {
  const data = fs.readFileSync('/etc/nonexistent-config.json');
  return JSON.parse(data);
}