---
title: "Preventing SSRF in AI Agents: Attack Vectors and Defenses"
linkTitle: "Preventing SSRF in AI Agents"
seoTitle: "SSRF in AI Agents: Attack Vectors and Defenses"
subtitle: "Cloud metadata, private CIDRs, DNS rebinding, and the parser zoo every agent runs through."
description: "SSRF against AI agents: cloud metadata, private CIDRs, DNS rebinding, encoded IPs, parser-differential gaps, and defenses that work."
date: 2026-04-29
lastmod: 2026-04-29
og_image: "https://pipelab.org/images/og/og-product.png"
faq:
  - q: "What is SSRF in the AI agent context?"
    a: "SSRF (Server-Side Request Forgery) in AI agents is when an attacker convinces the agent to make an outbound request to an internal address. Targets include cloud metadata endpoints, private network services, and link-local addresses. The agent runs the request because it follows tool calls without human URL review."
  - q: "Why is the 169.254.169.254 address special?"
    a: "169.254.169.254 is the link-local IPv4 address that AWS, GCP, and Azure use to expose instance metadata, including IAM credentials and service account tokens. An agent that fetches that URL from inside a cloud VM hands the attacker machine identity. The 2019 Capital One breach turned on exactly this endpoint."
  - q: "How does DNS rebinding bypass an SSRF allowlist?"
    a: "DNS rebinding sets a low TTL on a hostname. The first lookup returns a public IP and passes the allowlist check. The second lookup, used at connection time, returns a private IP. The agent connects to the private address while the policy log shows the public one. Pinning the resolved IP for the request lifetime kills the attack."
  - q: "Why is agent SSRF harder to defend than web SSRF?"
    a: "Web SSRF requires user input to reach a fetcher. Agent SSRF rides through every tool call, every fetched link, and every poisoned MCP description. The URL never reaches a human reviewer. Multiple parsers in the chain (LLM, MCP client, HTTP library, DNS resolver) disagree on edge cases, and each disagreement is a bypass."
  - q: "What defenses stop SSRF in agents?"
    a: "A CIDR blocklist applied after DNS resolution, a scheme allowlist for http and https only, DNS pinning across the request lifetime, and rejection of IPv4-mapped IPv6 and encoded numeric IPs. URL canonicalization runs before any of these checks so the parser sees the same URL the connection will use."
  - q: "What about IPv6 metadata addresses?"
    a: "AWS exposes instance metadata over IPv6 at fd00:ec2::254 in addition to the IPv4 address. GCP and Azure document IPv6 access for metadata in some regions. Any SSRF blocklist that only covers IPv4 leaves the IPv6 path open. Block fc00::/7, ::1/128, and the documented metadata addresses on every cloud you target."
  - q: "Does TLS hostname pinning help against SSRF?"
    a: "Yes. After resolving a hostname and validating the IP, pin the SNI to the validated hostname for the connection. A redirect or rebind that swaps the IP also has to forge the TLS certificate, which it cannot do for hostnames the agent did not authorize. Pair this with the post-resolution CIDR check."
learn_cat: concepts
level: deep
tags:
  - ssrf
  - egress
  - cloud-metadata
---
SSRF (Server-Side Request Forgery) was a server-side problem before agents existed. A web app would accept a URL parameter, fetch it server-side, and return the body. Attackers used that fetcher to reach internal services the public could not. The classic mitigation list (block private CIDRs, reject schemes other than http and https, resolve once and pin the IP) was already well documented before LLMs showed up.

AI agents bring the same primitive into a worse shape. The agent fetches URLs without a human in the loop. The URLs come from tool calls, fetched documents, MCP tool descriptions, and prompt injection payloads embedded in any of those. The trust path is longer and the input is adversarial by default. Web-SSRF defenses still apply, just against more parsers, more transports, and more URL-smuggling surfaces.

*Last reviewed 2026-05-06 by Josh Waldrep. I expanded the IPv6 metadata and parser-differential examples after revisiting the Capital One material; the rest is unchanged.*

## SSRF in the agent context

Web SSRF needs a fetcher and a user-controlled URL parameter. Agent SSRF needs a tool call. The threat model is different:

- **No URL review.** A web app developer chooses which endpoints accept URLs. An agent will follow any link it reads, including links inside fetched HTML, MCP tool responses, and tool descriptions.
- **Multiple parsers in the chain.** The model writes a URL string. The MCP client parses it. The agent's HTTP library parses it. The DNS resolver parses the hostname. Each layer can normalize differently.
- **Cloud-resident agents.** Most production agents run on AWS, GCP, or Azure. The 169.254.169.254 metadata service is reachable by default unless someone explicitly blocked it.
- **Prompt-injected URL fields.** A poisoned MCP tool description can plant a metadata URL into the agent's context. The agent then constructs a tool call that includes that URL as a parameter. The MCP server fetches it.

The core primitives are the same. There are just more places an attacker can reach them now.

## Attack vectors specific to agents

### Cloud metadata endpoints

Every major cloud exposes instance metadata at the link-local IPv4 address `169.254.169.254`. The path varies:

- AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>`
- GCP: `http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token`
- Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01`

AWS introduced IMDSv2 to require a session token before the metadata service responds, which raises the bar for accidental exposure but does not block an agent that can issue both the token request and the credentials request. IMDSv2 is opt-in on older AMIs.

IPv6 widens the surface. AWS documents `fd00:ec2::254` as the IPv6 metadata address. GCP supports IPv6 metadata in dual-stack VPCs. Any SSRF blocklist that only covers IPv4 leaves the IPv6 path open.

The 2019 Capital One breach ([DOJ conviction announcement](https://www.justice.gov/usao-wdwa/pr/former-seattle-tech-worker-convicted-wire-fraud-and-computer-intrusions)) hinged on a misconfigured WAF that allowed an attacker to reach the EC2 metadata service from a server-side fetcher. The attack pattern is identical for agents: any tool that fetches a URL from a cloud VM is one prompt injection away from leaking IAM credentials.

### Private CIDR ranges

The standard private ranges have to be blocked at minimum:

- IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `127.0.0.0/8`, `100.64.0.0/10` (CGN), `0.0.0.0/8`
- IPv6: `fc00::/7` (ULA), `fe80::/10` (link-local), `::1/128` (loopback)

Container and Kubernetes deployments add more: pod CIDRs, service CIDRs, and node management addresses. The blocklist needs to cover every range that resolves to internal infrastructure, not only the IETF private blocks.

### DNS rebinding

DNS rebinding works because some applications resolve a hostname twice. The first lookup feeds the policy check. The second lookup, performed at connection time, feeds the socket call. An attacker controls the authoritative nameserver for the host and returns:

1. First query: TTL 0, points to a public IP that passes the allowlist.
2. Second query (a moment later): TTL 0, points to `127.0.0.1` or a private IP.

The application validates the public IP, then connects to the private IP. The fetcher reaches localhost services that never expected outbound traffic. Princeton and Stanford research from the 2000s ([Jackson et al.](https://crypto.stanford.edu/dns/dns-rebinding.pdf)) covered this in detail, and the technique reappeared in [browser-based variants](https://en.wikipedia.org/wiki/DNS_rebinding). Agents are vulnerable for the same reason web servers were: the resolution and the connection are not bound to the same IP.

### IPv4-mapped IPv6

The address `::ffff:127.0.0.1` is `127.0.0.1` viewed through an IPv6 socket. A blocklist that checks only IPv4 strings or only IPv6 strings can miss it. The dual-stack representation has to be normalized before the CIDR check.

### Numeric IP encoding

Most URL parsers accept IPs in non-dotted forms:

- Decimal: `2130706433` (equals `127.0.0.1`)
- Hex: `0x7f000001`
- Octal: `0177.0.0.1`
- Mixed: `127.1` (equals `127.0.0.1` on libc-style parsers)

A naive substring check for "127.0.0.1" misses every encoded variant. The defense is canonicalization before any policy check, not regex on the raw string.

### Scheme abuse

`http://` and `https://` are the only schemes most agents need. Others open separate attack surfaces:

- `file://` reads local files through the URL path
- `gopher://` lets an attacker craft arbitrary TCP payloads, including SMTP and Redis commands
- `ftp://` exposes legacy file transfer with weak auth
- `dict://`, `ldap://`, `jar://`, and several others have documented SSRF tricks

Reject every scheme except http and https. Allowlists beat blocklists here because the parser will keep adding schemes faster than the blocklist will.

### Parser differential vulnerabilities

The LLM writes a URL string. The MCP client validates it. The HTTP library re-parses it. The DNS resolver parses the hostname. Different parsers disagree on:

- Whitespace inside the host (some accept, some reject)
- Embedded credentials (`http://attacker.com@169.254.169.254/`)
- Trailing dots on hostnames (`169.254.169.254.`)
- Percent-encoded host octets (`%31%36%39.254.169.254`)
- Unicode normalization in hostnames (IDN, mixed scripts)
- IPv6 zone IDs (`fe80::1%eth0`)

Each disagreement is a bypass. If the policy parser sees one URL and the connection parser sees another, the policy is meaningless.

## Why agent SSRF is harder than web SSRF

Agent SSRF is worse than its server-side ancestor for reasons that compound.

A web app developer chooses which endpoints accept URLs. An agent will follow any link it reads, including links inside fetched HTML, MCP tool responses, and tool descriptions, with no stop to ask whether `http://169.254.169.254/latest/meta-data/iam/security-credentials/role` looks suspicious.

**URL fields hide in tool descriptions.** Tool poisoning attacks (Invariant Labs [disclosed the pattern](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) in April 2025) plant instructions inside MCP tool descriptions. A poisoned description can include a URL the model is told to fetch, and the model treats it as documented behavior.

A single web app has one URL parser. An agent stack has the LLM (which writes URL strings), the MCP client (which validates them for some tools), the HTTP library (which parses them for the connection), and the DNS resolver (which handles the hostname). Each component normalizes differently, and bypasses live in the gaps.

## Defenses that work

The list is short, and partial deployment is partial defense. Each item has to be in place.

The first defense runs on the resolved IP, not the hostname. Hostname-based CIDR checks fall to DNS rebinding immediately, so resolve the hostname yourself, validate the IP, and then connect using that validated IP without letting the HTTP library re-resolve. Some HTTP libraries do not accept a pre-resolved IP. For those, perform the resolve, save the IP, attempt the connection, and verify the connection-time peer IP matches what you validated. A mismatch triggers a hard failure.

**Scheme allowlist.** http and https only. Reject everything else. Operators can extend the list when a use case demands it, but the default has to be tight.

**DNS pinning across the request lifetime.** Once the resolver returns an IP for a hostname, that IP holds for the duration of the request. Subsequent lookups in the same request reuse the cached value. This eliminates the rebinding gap between policy check and socket call.

**TLS hostname pinning.** After resolving the IP, pin the SNI to the original hostname when establishing TLS. An attacker who forces a redirect to a different IP cannot also forge the certificate for the original hostname.

URL canonicalization runs before any of the other checks. Decode percent-encoding, normalize numeric IP forms (decimal, hex, octal), normalize IPv4-mapped IPv6, strip trailing dots, lowercase the hostname, and reject embedded credentials. The canonical form goes to both policy lookup and the connection layer, so the parser sees the same URL the connection will use.

## How Pipelock checks SSRF

Pipelock's scanner pipeline runs SSRF after DLP and the domain blocklist, not before. The order matters: layers 2 and 3 (blocklist and DLP) inspect the original URL string before any DNS lookup, so secrets in the URL never trigger a DNS query that would leak them. Once those checks pass, Pipelock resolves the hostname, then runs the resolved IP through the CIDR blocklist defined by the `internal` config field. The default list covers the IETF private ranges plus link-local IPv4, IPv6 ULA, IPv6 link-local, and loopback.

The resolution is bound to the request. Pipelock validates the IP, then uses the same IP for the outbound connection rather than letting the HTTP client re-resolve. Schemes other than http and https are rejected before the request enters the pipeline. The same path runs for fetch (`/fetch?url=...`), forward proxy (CONNECT and absolute-URI), and WebSocket (`/ws?url=...`). MCP transports inherit the URL pipeline when a tool argument carries a URL, so a poisoned MCP description that plants a metadata URL still hits the same CIDR check.

## A short testing checklist

Run these probes against your own agent (in a controlled environment) to see what your stack catches:

1. **Direct metadata.** Ask the agent to fetch `http://169.254.169.254/latest/meta-data/`. The connection should never establish.
2. **IPv6 metadata.** Same test with `http://[fd00:ec2::254]/latest/meta-data/`. Many stacks miss this.
3. **Encoded loopback.** Ask the agent to fetch `http://2130706433/`. Decimal IP for 127.0.0.1.
4. Try `http://[::ffff:127.0.0.1]/`. IPv4-mapped IPv6 surface.
5. Try `file:///etc/passwd` and `gopher://internal-host:6379/_FLUSHALL`. Both should reject at the scheme allowlist.
6. Try `http://example.com@169.254.169.254/`. Some parsers honour the userinfo; some honour the authority. The defense rejects the embedded-credentials form.
7. **Rebinding harness.** Set up a domain with a 0-TTL record that returns a public IP first and `127.0.0.1` second. Ask the agent to fetch it twice and check whether the second request reaches localhost.

If any probe succeeds, the gap is real. Fix the parser disagreement or the missing CIDR before moving on.

## Further reading

- [Agent Egress Security](/learn/agent-egress-security/): credential leak vectors and defenses
- [AI Egress Proxy](/learn/ai-egress-proxy/): the proxy pattern that enforces SSRF and DLP at one point
- [What is an Agent Firewall?](/agent-firewall/): full architecture including capability separation
- [MCP Security](/learn/mcp-security/): SSRF through MCP tool calls and other tool-channel risks
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
