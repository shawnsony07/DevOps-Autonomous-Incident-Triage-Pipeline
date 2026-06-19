export function verifyAdminAccess(req, res, next) {
  const user = req.user;
  
  // ❌ BUG: If the user is unauthenticated, req.user is null/undefined.
  // This line throws: TypeError: Cannot read properties of undefined (reading 'role')
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
}
