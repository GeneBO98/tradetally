const bcrypt = require('bcryptjs');

async function hashPassword() {
  const password = 'tester';
  const hashedPassword = await bcrypt.hash(password, 10);
  console.log('Hashed password for "tester":');
  console.log(hashedPassword);
}

hashPassword();