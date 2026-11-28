// Toolchain setup must never inherit deployment settings. Only the pinned
// Wrangler upload receives its explicit account and API token.
export function stagingToolEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) =>
    /^(?:PATH|HOME|TMPDIR|TMP|TEMP|LANG|LC_[A-Z_]+|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
}
