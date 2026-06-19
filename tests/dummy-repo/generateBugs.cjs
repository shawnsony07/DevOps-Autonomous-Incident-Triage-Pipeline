const fs = require('fs');
const path = require('path');

const bugs = [
  {
    name: '01-missing-import.js',
    content: `// ❌ BUG: axios is not imported
export async function fetchData(url) {
  const response = await axios.get(url);
  return response.data;
}`
  },
  {
    name: '02-undefined-method.js',
    content: `// ❌ BUG: Typo in method name
export function sortData(arr) {
  return arr.tsorted();
}`
  },
  {
    name: '03-off-by-one.js',
    content: `// ❌ BUG: Loop goes out of bounds (<= arr.length) causing undefined access
export function processArray(arr) {
  for (let i = 0; i <= arr.length; i++) {
    console.log(arr[i].toString());
  }
}`
  },
  {
    name: '04-promise-without-await.js',
    content: `// ❌ BUG: forgot to await db.save
export async function createUser(data, db) {
  const user = db.save(data);
  return user.id; // user is a Promise, user.id is undefined
}`
  },
  {
    name: '05-json-parse-error.js',
    content: `// ❌ BUG: assumes data is always valid JSON
export function parseConfig(data) {
  return JSON.parse(data);
}`
  },
  {
    name: '06-typeerror-null.js',
    content: `// ❌ BUG: doesn't check if user is null
export function getUsername(user) {
  return user.profile.username;
}`
  },
  {
    name: '07-regex-matchall.js',
    content: `// ❌ BUG: matchAll requires global flag
export function extractTags(text) {
  const regex = /#[a-z]+/;
  return [...text.matchAll(regex)];
}`
  },
  {
    name: '08-const-reassignment.js',
    content: `// ❌ BUG: Reassigning a const variable
export function updateCounter() {
  const count = 0;
  count++;
  return count;
}`
  },
  {
    name: '09-unhandled-rejection.js',
    content: `// ❌ BUG: No try/catch around async call that throws
export async function handler(apiClient) {
  const data = await apiClient.fetchImportantData();
  return data.toUpperCase();
}`
  },
  {
    name: '10-map-on-object.js',
    content: `// ❌ BUG: Trying to use .map on an object
export function extractNames(usersObj) {
  return usersObj.map(u => u.name);
}`
  },
  {
    name: '11-bad-number-method.js',
    content: `// ❌ BUG: substring is a string method, not number
export function calculateAverage(total, count) {
  const avg = total / count;
  return avg.substring(0, 4);
}`
  },
  {
    name: '12-circular-json.js',
    content: `// ❌ BUG: JSON.stringify on circular structure
export function serializeData(obj) {
  obj.self = obj;
  return JSON.stringify(obj);
}`
  },
  {
    name: '13-wrong-this-context.js',
    content: `// ❌ BUG: Losing 'this' context in a callback
class Service {
  constructor() { this.name = 'MyService'; }
  logName() { console.log(this.name); }
  run() {
    setTimeout(this.logName, 100);
  }
}
export const service = new Service();`
  },
  {
    name: '14-array-negative-index.js',
    content: `// ❌ BUG: Using negative index in array
export function getLastElement(arr) {
  return arr[-1].id;
}`
  },
  {
    name: '15-fs-sync-missing-file.js',
    content: `import fs from 'fs';
// ❌ BUG: Using fs.readFileSync on a missing file without try/catch
export function loadConfig() {
  const data = fs.readFileSync('/etc/nonexistent-config.json');
  return JSON.parse(data);
}`
  },
  {
    name: '16-settimeout-string.js',
    content: `// ❌ BUG: Passing a string to setTimeout instead of a function
export function delayAction() {
  setTimeout("console.log('done')", 1000);
}`
  },
  {
    name: '17-jwt-sign-sync.js',
    content: `import jwt from 'jsonwebtoken';
// ❌ BUG: jwt.sign with a callback returns undefined but code expects a token string
export function generateToken(payload) {
  const token = jwt.sign(payload, 'secret', (err, t) => t);
  return token.split('.');
}`
  },
  {
    name: '18-reduce-no-initial.js',
    content: `// ❌ BUG: reduce on empty array with no initial value
export function sumEmptyArray(arr) {
  return arr.reduce((a, b) => a + b);
}`
  },
  {
    name: '19-decodeuricomponent.js',
    content: `// ❌ BUG: decodeURIComponent throws on malformed URI
export function parseUrlQuery(query) {
  return decodeURIComponent(query);
}`
  },
  {
    name: '20-crypto-bad-algorithm.js',
    content: `import crypto from 'crypto';
// ❌ BUG: misspelled algorithm name
export function hashData(data) {
  return crypto.createHash('sha-256').update(data).digest('hex');
}`
  }
];

bugs.forEach(bug => {
  fs.writeFileSync(path.join(__dirname, bug.name), bug.content);
});
console.log('Created 20 bug files');
