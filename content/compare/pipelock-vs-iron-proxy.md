---
title: "iron-proxy Review: What It Does, Setup, and Open-Source Alternatives"
linkTitle: "Pipelock vs iron-proxy"
seoTitle: "iron-proxy Review: Setup and Alternatives"
subtitle: "Content inspection with signed receipts next to default-deny egress with credential brokering. Two open-source proxies, two halves of the same problem."
description: "iron-proxy allowlists agent egress and swaps placeholder credentials. What it does, how to set it up, and how it compares to open-source Pipelock."
date: 2026-04-11
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "iron-proxy"
  subject_job: "Default-deny egress proxy. Allowlists destinations, keeps real credentials out of the sandbox, and authorizes MCP tools."
  subject_boundary: "Network path, self-hosted proxy with an optional control plane"
  subject_source: "Open source, Apache-2.0"
  subject_pricing: "Free; a hosted control plane is offered alongside the self-hosted one"
  subject_deploy: "Go binary, Docker image, Helm chart"
  pick_subject: "Your first worry is a compromised sandbox leaking real API keys. Boundary secret rewriting means the sandbox never holds them."
  pick_pipelock: "You need to know what is inside the traffic: leaked secrets in bodies, injected responses, poisoned tool descriptions, and a signed record of each decision."
  pick_both: "iron-proxy owns the credential boundary and the allowlist. Pipelock inspects the payloads and receipts the decisions. They sit at different layers and don't conflict."
sources:
  - label: "iron-proxy README: installation and production usage"
    url: "https://github.com/paradigmxyz/iron-proxy#installation"
    checked: 2026-10-21
  - label: "iron-proxy images on Docker Hub"
    url: "https://hub.docker.com/r/ironsh/iron-proxy"
    checked: 2026-10-21
  - label: "iron-proxy releases"
    url: "https://github.com/paradigmxyz/iron-proxy/releases"
    checked: 2026-10-21
  - label: "iron-proxy Docker Compose example"
    url: "https://github.com/paradigmxyz/iron-proxy/tree/main/examples/docker-compose"
    checked: 2026-10-21
  - label: "iron-proxy README"
    url: "https://github.com/paradigmxyz/iron-proxy"
    checked: 2026-09-01
    note: "repository now lives under the paradigmxyz organization; the old ironsh path redirects"
  - label: "iron-proxy docs: MCP interception"
    url: "https://docs.iron.sh/policies/mcp-interception"
    checked: 2026-09-01
  - label: "iron-proxy docs: LLM Judge transform"
    url: "https://docs.iron.sh/policies/llm-judge"
    checked: 2026-09-01
  - label: "iron-proxy docs: control plane overview"
    url: "https://docs.iron.sh/control-plane/overview"
    checked: 2026-09-01
  - label: "iron-proxy source: OAuth transform, require flag"
    url: "https://github.com/paradigmxyz/iron-proxy/blob/main/internal/transform/oauth/oauth.go"
    checked: 2026-09-01
  - label: "iron-proxy releases"
    url: "https://github.com/paradigmxyz/iron-proxy/releases"
    checked: 2026-09-01
    note: "v0.49.0 is the latest stable release; v0.50.0 release candidates exist"
faq:
  - q: "What's the difference between Pipelock and iron-proxy?"
    a: "Both are open-source Go egress proxies for AI agents. Pipelock inspects HTTP, WebSocket, and MCP payloads routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed receipts when a signing key is configured. iron-proxy enforces a domain allowlist and uses boundary secret rewriting: the proxy holds the real credentials and the sandbox holds placeholders that get swapped on the way out. One decides what may leave and with which credential. The other decides what is inside the traffic."
  - q: "Does iron-proxy scan MCP traffic?"
    a: "iron-proxy authorizes MCP tools. Its docs describe a default-deny tool allowlist, rejection of denied tools/call requests with a JSON-RPC error, and filtering of tools/list so denied tools never appear. Pipelock inspects the MCP content itself: tool descriptions, arguments, and responses, for poisoning, rug-pull drift, and injection. Authorization and content inspection are different jobs."
  - q: "Can I use Pipelock and iron-proxy together?"
    a: "Yes. iron-proxy protects credentials at the identity boundary and gates destinations. Pipelock scans what flows through the allowed connections and records the decision. Chain them so the agent's traffic passes through both."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It scans HTTP, WebSocket, and MCP traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured.

**[iron-proxy](https://github.com/paradigmxyz/iron-proxy)** is an open-source egress proxy for AI agents. Its core idea is boundary secret rewriting: the proxy holds the real secrets, the sandbox only ever sees placeholder tokens, and the proxy swaps them in at egress. A compromised sandbox can't leak a credential it never had. Around that core it has grown a domain allowlist, TLS-terminating inspection, MCP tool authorization, a policy model it calls the LLM Judge, and a fleet control plane. The repository moved to the paradigmxyz GitHub organization; the old path redirects.

iron-proxy answers "may this leave, and with which credential?" Pipelock answers "what is in this traffic, and can I prove what I decided?" The two overlap more than they used to, and they still answer different questions.

## Where they overlap now

iron-proxy's recent releases moved onto surfaces Pipelock has covered for a while. MCP is first-class: a default-deny tool allowlist, `tools/call` denials returned as JSON-RPC errors, and `tools/list` filtering so denied tools never reach the agent's catalog. The LLM Judge transform asks a model for an allow or deny decision on outbound HTTP requests. The control plane handles enrollment, fleet policy, and audit search.

So the distinction is no longer that one does MCP and the other doesn't. It's the kind of MCP control. iron-proxy decides which tools may be called. Pipelock reads the tool descriptions, arguments, and responses and looks for poisoning, drift, and injection. A serious MCP deployment wants both.

## iron-proxy setup at a glance

From the [iron-proxy README](https://github.com/paradigmxyz/iron-proxy#installation) (checked 2026-10-21):

- **Install.** Docker images are published on [Docker Hub](https://hub.docker.com/r/ironsh/iron-proxy), and prebuilt Linux and macOS binaries for amd64 and arm64 are on [GitHub Releases](https://github.com/paradigmxyz/iron-proxy/releases). It can also be built from source.
- **Try it.** The repository ships a [Docker Compose example](https://github.com/paradigmxyz/iron-proxy/tree/main/examples/docker-compose) you can start with `docker compose up`.
- **Production shape.** You generate a CA, because iron-proxy terminates TLS with leaf certificates it signs on the fly, then create a Docker network, start the proxy, and route client containers through it. Those containers must trust the CA.

## Feature comparison

| Feature | Pipelock | iron-proxy |
|---------|----------|------------|
| **Architecture** | Network proxy, single self-hosted binary | Network proxy, self-hosted Go binary |
| **Primary scope** | HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, and MCP content scanning | Domain allowlist, TLS-terminating inspection, boundary secret rewriting |
| **Domain allowlist** | Yes | Yes, the primary mechanism |
| **Credential scanning (DLP)** | 65 built-in patterns, encoding-aware, environment leak detection | Boundary rewriting instead: the sandbox never holds real secrets |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization on scanned responses | LLM Judge policy model on outbound requests, not pattern scanning of responses |
| **Tool poisoning and rug-pull drift** | Yes | Not documented |
| **SSRF protection** | Private IP, metadata, and DNS rebinding checks | Not documented in public docs |
| **MCP control** | Content inspection of descriptions, arguments, and responses; resource and prompt enforcement | Tool authorization: default-deny allowlist, call denial, list filtering |
| **A2A scanning** | Yes | No |
| **WebSocket** | Frame-level DLP and injection scanning in both directions | Proxied natively as a stream, per the README; frame-level inspection is not documented |
| **Boundary secret rewriting** | No, capability separation by deployment instead | Yes, the core feature |
| **Credential brokering** | No | OAuth2 client credentials, JWT bearer, GCP service accounts, secrets managers |
| **Fleet control plane** | Conductor, Enterprise tier | Enrollment, fleet policy, audit search; self-hosted via Helm or hosted |
| **Signed offline-verifiable receipts** | Yes: Ed25519 receipts, shipped verifier, operator-held key | No; audit logs and OTLP export |
| **Process sandbox** | Landlock, seccomp, and network namespaces on Linux; sandbox-exec on macOS | Not documented |
| **Source availability** | Apache-2.0 core; Enterprise features under ELv2 | Apache-2.0 |

## When to pick Pipelock

**You want content inspection across HTTP, WebSocket, and MCP.** Pipelock scans outbound URLs, headers, and bodies for 65 credential patterns, decoding base64, hex, and URL encoding first, and runs injection patterns through several normalization passes on scanned responses. Tool descriptions and arguments get the same treatment. If your threat model includes a poisoned tool description or a secret hidden in a request body, this is the layer that sees it.

**You need MCP content awareness.** Pipelock fingerprints tool descriptions, flags rug-pull drift when a trusted tool changes mid-session, and inspects arguments and responses. iron-proxy's MCP feature decides which tools may run; it does not read what they say.

**You need evidence, not just logs.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions. An auditor can verify the chain offline against your published key without trusting the proxy's own logs. iron-proxy's audit search is a log you read through its control plane.

## When to pick iron-proxy

**Your first worry is credential exposure inside the sandbox.** Boundary secret rewriting is a different design. The proxy holds the real keys, the sandbox gets a placeholder, and the swap happens at egress. Pipelock doesn't do this; it relies on deployment isolation to keep the proxy and the secrets apart.

**You want default-deny egress with credential brokering.** iron-proxy mints and injects OAuth tokens, JWT bearer assertions, and cloud service-account credentials per request from a secrets manager. If the shape you're shopping for is "the agent never touches a real credential", that's this project.

**You already treat the sandbox as untrusted and want the proxy to be the trust anchor for credentials.** The placeholder-token pattern maps directly onto that design.

## Architecture differences

**iron-proxy asks:** how do we stop the sandbox from ever seeing real secrets? It terminates TLS for ordinary HTTP so it can rewrite headers, relays WebSocket and server-sent-event streams natively, with no frame-level inspection documented, and substitutes real credentials at the edge. A malicious response or a compromised process can't exfiltrate a credential the sandbox never held.

**Pipelock asks:** what is moving across the mediated boundary, and can I prove what I did about it? Routed request bodies are checked for leaked or encoded secrets, routed tool descriptions for poisoning, scanned responses for injection, and SSRF is checked before DNS resolution. With a signing key configured, Pipelock can emit signed receipts for mediated decisions.

These compose. Put iron-proxy at the credential boundary and Pipelock on the content path.

## Two implementation notes, stated fairly

iron-proxy's credential injection is fail-open by default. In the OAuth transform, `require` defaults to false, and the source comment says a mint failure is logged and the request is forwarded without the token so one broken credential doesn't take down every matching request. That's a defensible availability choice, and you can set `require: true` per entry. It's worth knowing before you rely on the swap as a security boundary. Pipelock's mediated enforcement paths fail closed: a timeout or a parse failure blocks the request, and the block is receipted.

iron-proxy's payload inspection applies to ordinary HTTP request paths. Its README describes WebSocket upgrades as proxied natively as streams, and no frame-level inspection is documented for that path. Pipelock scans WebSocket frames in both directions.

Neither note is a defect. They're design choices, and a default can change in one commit, which is why the sources below carry dates.

## Further reading

- [Pipelock](/pipelock/): the product page
- [What is an agent firewall?](/agent-firewall/): definition and evaluation checklist
- [Agent egress security](/learn/agent-egress-security/): why egress is the control point for agents
- [AI egress proxy](/learn/ai-egress-proxy/): how egress proxies fit into agent security
- [Pipelock vs open source MCP gateways](/compare/pipelock-vs-open-source-mcp-gateways/): the routing-gateway side of the same question
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
