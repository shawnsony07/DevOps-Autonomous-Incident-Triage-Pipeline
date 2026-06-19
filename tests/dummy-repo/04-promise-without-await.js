// ❌ BUG: forgot to await db.save
export async function createUser(data, db) {
  const user = db.save(data);
  return user.id; // user is a Promise, user.id is undefined
}