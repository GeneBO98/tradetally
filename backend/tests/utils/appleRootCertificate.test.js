const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');

test('bundles the authentic public Apple Root CA G3 certificate', () => {
  // Published at https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
  const pem = fs.readFileSync(path.join(__dirname, '../../src/certs/apple-root-ca-g3.pem'), 'utf8');
  const certificate = new X509Certificate(pem);
  expect(certificate.fingerprint256).toBe('63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79');
  expect(certificate.ca).toBe(true);
  expect(certificate.verify(certificate.publicKey)).toBe(true);
  expect(pem).not.toContain('PRIVATE KEY');
});
