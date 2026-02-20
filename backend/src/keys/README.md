OAuth signing keys must not be committed to Git.

Set one of these in your environment:

- `OAUTH_PRIVATE_KEY` (PEM with `\n` escapes)
- `OAUTH_PRIVATE_KEY_PATH` (absolute path to private key PEM)

Optional public key overrides:

- `OAUTH_PUBLIC_KEY`
- `OAUTH_PUBLIC_KEY_PATH`

If no public key is configured, the server derives it from the private key.

Example key generation:

```bash
openssl genpkey -algorithm RSA -out oauth-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in oauth-private.pem -out oauth-public.pem
```
