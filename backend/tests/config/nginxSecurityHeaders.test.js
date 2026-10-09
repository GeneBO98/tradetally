const fs = require('fs');
const path = require('path');

describe('bundled nginx security headers', () => {
  const nginxConfig = fs.readFileSync(
    path.resolve(__dirname, '../../../docker/nginx.conf'),
    'utf8'
  );

  test('hides upstream headers that nginx adds to proxied responses', () => {
    const defaultServerStart = nginxConfig.indexOf('listen 80 default_server;');
    const firstLocationStart = nginxConfig.indexOf('location ', defaultServerStart);
    const serverPreamble = nginxConfig.slice(defaultServerStart, firstLocationStart);
    const overlappingHeaders = [
      'Content-Security-Policy',
      'X-Frame-Options',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Resource-Policy',
      'Cross-Origin-Opener-Policy'
    ];

    expect(defaultServerStart).toBeGreaterThan(-1);
    expect(firstLocationStart).toBeGreaterThan(defaultServerStart);

    for (const header of overlappingHeaders) {
      expect(serverPreamble).toContain(`add_header ${header} `);
      expect(serverPreamble).toContain(`proxy_hide_header ${header};`);
    }
  });
});
