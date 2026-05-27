const escapeHtml = require('../../src/utils/escapeHtml');

describe('escapeHtml', () => {
  test('escapes dangerous HTML characters while preserving apostrophes', () => {
    expect(escapeHtml(`I'm <script>"quoted"</script> & okay`))
      .toBe(`I'm &lt;script&gt;&quot;quoted&quot;&lt;/script&gt; &amp; okay`);
  });
});
