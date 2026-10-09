// Patterns end on an explicit path, query, fragment, or URL boundary because the
// two callers hand this function different shapes of the same
// link: site-audit.mjs tests the raw href straight out of the HTML, which still
// carries any query string or fragment, while external-link-audit.mjs tests a
// normalized URL with the fragment already stripped. A `$`-only boundary blocks a
// retired URL in one audit and quietly misses it in the other.
export const blockedExternalLinkPatterns = [
  /github\.com\/proximity-mcp\/proximity\/?(?:[?#]|$)/i,
  /snyk\.io\/platform\/agent-security\/?(?:[?#]|$)/i,
  /github\.com\/luckyPipewrench\/agent-egress-bench\/blob\/main\/docs\/methodology\.md(?:[?#]|$)/i,
  /github\.com\/luckyPipewrench\/agent-egress-bench\/blob\/main\/schemas\/receipt-scoring-profile\.schema\.json(?:[?#]|$)/i,
];

export function isBlockedExternalLink(url) {
  return blockedExternalLinkPatterns.some((pattern) => pattern.test(url));
}
