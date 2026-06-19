import { Client } from 'pg';

export async function connectToDatabase(options) {
  // ❌ BUG: Typo in the variable name. We meant to use options.connectionString.
  // This line throws: ReferenceError: connString is not defined
  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  return client;
}
