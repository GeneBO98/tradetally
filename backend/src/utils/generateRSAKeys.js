const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save keys to files
const keysDir = path.join(__dirname, '../keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

fs.writeFileSync(path.join(keysDir, 'oauth-private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'oauth-public.pem'), publicKey);

console.log('RSA keys generated successfully!');
console.log('Private key saved to:', path.join(keysDir, 'oauth-private.pem'));
console.log('Public key saved to:', path.join(keysDir, 'oauth-public.pem'));
