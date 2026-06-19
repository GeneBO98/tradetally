// jose is ESM-only and only used by Apple IAP verification, which the
// integration suite never exercises. Stub it so Jest's CJS loader can parse
// the server module tree.
module.exports = {
  decodeProtectedHeader: () => {
    throw new Error('jose stub: not available in integration tests');
  },
  importX509: () => {
    throw new Error('jose stub: not available in integration tests');
  },
  jwtVerify: () => {
    throw new Error('jose stub: not available in integration tests');
  }
};
