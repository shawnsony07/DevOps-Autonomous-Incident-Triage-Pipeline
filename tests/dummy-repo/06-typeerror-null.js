// ❌ BUG: doesn't check if user is null
export function getUsername(user) {
  return user.profile.username;
}