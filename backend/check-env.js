// Quick script to check environment variables in running container
console.log('='.repeat(60));
console.log('ENVIRONMENT VARIABLE CHECK');
console.log('='.repeat(60));
console.log('');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('VITE_API_URL:', process.env.VITE_API_URL);
console.log('INSTANCE_URL:', process.env.INSTANCE_URL);
console.log('');
console.log('='.repeat(60));

// Check if FRONTEND_URL points to dev
if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('dev.tradetally.io')) {
  console.log('[ERROR] FRONTEND_URL points to dev.tradetally.io!');
  console.log('[FIX] Update your .env file and restart Docker containers:');
  console.log('  1. Edit .env: FRONTEND_URL=https://tradetally.io');
  console.log('  2. Run: docker-compose restart app');
} else if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('tradetally.io')) {
  console.log('[SUCCESS] FRONTEND_URL is correctly set to production');
} else {
  console.log('[WARNING] FRONTEND_URL is not set to tradetally.io');
  console.log('[INFO] Current value:', process.env.FRONTEND_URL);
}
console.log('='.repeat(60));
