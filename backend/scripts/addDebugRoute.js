// This is a temporary script to add a debug route
// We'll add this to the server to help identify which user is logged in

const debugRoute = `
// Add this to your routes or server.js temporarily
app.get('/api/debug/whoami', authenticate, (req, res) => {
  res.json({
    userId: req.user.id,
    email: req.user.email,
    username: req.user.username,
    role: req.user.role
  });
});
`;

console.log('Add this route to help debug user identity:');
console.log(debugRoute);