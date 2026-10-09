---
title: "Request Policy: Allow and Deny Individual API Operations"
linkTitle: "Request Policy"
seoTitle: "Request Policy: Operation-Level API Allow/Deny"
subtitle: "A host allowlist says where an agent can go. Request policy says what it can do once it gets there: deny a GraphQL mutation, a JSON-RPC command, or an admin DELETE while everything else forwards."
description: "Pipelock request policy allows or denies individual outbound API operations: GraphQL mutations, JSON batch sub-requests, and admin calls, not just hosts."
date: 2026-05-31
lastmod: 2026-05-31
learn_cat: operator
level: intro
tags:
  - request-policy
  - egress
  - graphql
related:
  - hermes-integration
  - agent-egress-control
  - verifiable-egress-control
faq:
  - q: "What is operation-level request policy?"
    a: "Request policy is an allow-by-default deny or warn rail over outbound HTTP API operations. Where a domain allowlist matches on host and DLP matches on content, request policy matches on what the request is trying to do: a GraphQL mutation root field, a JSON-RPC command, or an admin DELETE. It blocks the dangerous operation and forwards everything else."
  - q: "How is request policy different from a host allowlist?"
    a: "A host allowlist decides whether the agent can reach api.example.com at all. Request policy assumes the host is allowed and decides whether a specific operation against it is permitted. You can let an agent read from a GraphQL API and still deny the deleteAccount mutation, or allow a JSON batch and reject one dangerous sub-request inside it."
  - q: "Can request policy be misconfigured into blocking everything?"
    a: "No. There is deliberately no section-level default_action knob, so a request forwards unless a specific rule matches it. Each rule is block or warn on its own. The design removes the failure mode where one bad setting turns the whole section into default-deny."
  - q: "Does request policy read request bodies?"
    a: "Only when it has to. It reads a body when a route-matched rule carries a GraphQL or discriminator operation predicate that needs to inspect the operation. It is independent of request_body_scanning and composes with it rather than replacing it."
---

A host allowlist answers one question: can the agent reach this destination at all. It cannot answer the next one. Once `api.example.com` is allowed, every operation against it is allowed too, the harmless read and the account-deleting mutation alike. Request policy is the rail for that second question.

Request policy is an allow-by-default deny or warn rail over outbound HTTP API operations. Where DLP matches on content and the domain blocklist matches on host, request policy matches on what the request is trying to do: a GraphQL mutation root field, a JSON-RPC command, an admin `DELETE`. It blocks the dangerous operations and forwards everything else untouched.

## The model

A request forwards unless a rule matches. There is no section-level `default_action`, so the section cannot be configured into a default-deny posture by accident. Each rule is `block` or `warn`, set per rule.

Every rule has a route, which selects which requests it applies to, and an optional operation predicate, either `graphql` or `discriminator`. When a rule carries both, both must match: the route selects the request, then the predicate runs against the operation extracted from its body. A blocked call returns a machine-readable `request_policy_deny` reason the agent can act on.

## Blocking dangerous GraphQL mutations

```yaml
request_policy:
  enabled: true
  on_parse_error: block         # block (default) | warn | allow
  on_opaque_operation: block    # block (default) | warn | allow
  rules:
    - name: "block-account-mutations"
      action: block
      reason: "account-state mutations require human review"
      route:
        hosts: ["api.vendor.example", "*.vendor.example"]
        methods: ["POST"]
        path_prefixes: ["/graphql"]
      graphql:
        operation_types: ["mutation"]
        root_field_patterns: ["^delete", "^transfer"]
```

This blocks any POST to the GraphQL endpoint whose document contains a mutation whose root field starts with `delete` or `transfer`. A query that only reads, or a mutation on an unrelated field, forwards.

The extractor resolves aliases to the real field and expands top-level fragment spreads and inline fragments, so a deny rule matches the field that actually executes, not a cosmetic alias or a field hidden inside a fragment. Every operation in a document or a JSON batch is evaluated, never just the first, so a dangerous operation cannot hide behind a benign sibling.

## The shapes attackers reach for

Operation-level matching covers the request shapes that slip past host-only and content-type-only checks:

- JSON batches, where the sub-requests are evaluated recursively rather than treated as one opaque call.
- GraphQL over GET, where the query rides in the URL and the request carries no body or `Content-Type`. Scope GraphQL rules by path, not by content type, so these still match.
- Opaque operations the extractor cannot parse, handled by `on_opaque_operation` (block by default) instead of being waved through.

## Where it sits

Request policy runs before the learn-and-lock contract gate, so a contract allow can never suppress an operation-policy block. It is independent of `request_body_scanning`; it reads a body itself only when a route-matched operation predicate needs one. It composes with DLP and the domain blocklist rather than replacing either.

For the full field reference, see the configuration guide in the Pipelock repository. To turn the operations your agent actually performs into a reviewed allowlist, pair this with [agent egress control](/learn/agent-egress-control/) and [verifiable egress control](/learn/verifiable-egress-control/). Agents that reach Pipelock through a framework hook instead of MCP wire in through the [Hermes integration](/learn/hermes-integration/).
