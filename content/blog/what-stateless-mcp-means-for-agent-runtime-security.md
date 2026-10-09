---
title: "What Stateless MCP Means for Agent Runtime Security"
linkTitle: "Stateless MCP and Runtime Security"
date: 2026-05-23
author: "Josh Waldrep"
summary: "MCP 2026-07-28 deletes the session. Here's what that changes at the runtime layer, and why outside-the-agent mediation matters more under stateless."
description: "MCP 2026-07-28 removes Mcp-Session-Id, the initialize handshake, and resumable streams. What stateless means for runtime agent security."
tags: ["ai-security", "agent-security", "mcp", "agent-firewall", "pipelock", "stateless-mcp"]
faq:
  - q: "What changes in the MCP 2026-07-28 release candidate?"
    a: "The protocol becomes stateless. The Mcp-Session-Id header is removed (SEP-2567), the initialize / initialized handshake is removed (SEP-2575), and resumable SSE streams are deleted. Two new wire-level extensions ship as first-class primitives: MCP Apps for server-supplied UI templates and MCP Tasks for long-running async work. Six auth SEPs harden OAuth and OIDC interaction. Spec is locked 2026-05-21, scheduled stable 2026-07-28."
  - q: "Does stateless MCP make agent security easier or harder?"
    a: "The auth hardening makes one slice easier: issuer binding, RFC 9207 validation, and DCR application_type restrictions close several long-standing OAuth holes. The runtime mediation layer gets harder. With no session, no upstream component is responsible for noticing tool drift across requests that fan out to different server replicas. Anything that depended on session continuity as a security anchor has to migrate to per-principal or per-request bindings."
  - q: "What is supervision debt?"
    a: "Supervision debt is a term coined by Fabian Williams (Microsoft Principal PM) for the cumulative trust deficit between the controls an agent system claims to ship with and the controls it actually ships with. The interest payment on supervision debt is the procurement cycle. Every renewal becomes another NDA review of an internal dashboard. Receipts pay down the observability slice of that debt. Runtime mediation pays down a different slice."
  - q: "How does Pipelock handle the stateless MCP transition?"
    a: "Pipelock v2.5 supports the current MCP. As the new RC stabilizes and SDKs adopt it, the likely migration path is compatibility first (both protocols held open side by side), then migrating session-keyed scanning surfaces (chain detection, CEE correlation, tool baseline binding) to a per-principal correlation key with bounded TTL. The Mcp-Method and Mcp-Name headers (SEP-2243) become first-class inputs to the tool policy engine. No release commitment yet; the threat model is what's locked in."
  - q: "What is the difference between runtime mediation and observability for AI agents?"
    a: "Runtime mediation is enforcement at the network or tool boundary: blocking, redacting, or escalating an agent action before it executes. Observability is the audit trail that records what happened. Both are control points in the five-layer model. Pipelock sits at the runtime layer and produces signed receipts that flow into the observability layer. The two compose; neither replaces the other."
blog_cat: "technical"
---

I wanted to use AI agents in my plumbing business. Quotes, invoices, payroll, internal tooling. I figured the big platforms had a security layer for running agents on real business data or some hosted solution. But the sobering reality was there isn't. So I started building one.

DSP and Den Delimarsky shipped the MCP 2026-07-28 release candidate yesterday. I read it that night. The session is gone and any request can hit any server. For a runtime mediator like Pipelock that's the kind of change you stop and reread.

The threats the old session model was an anchor for are still here but the anchor isn't. This post is what changes at the runtime layer and where Pipelock fits.

## The five control points sitting between agents and production

Fabian Williams (Principal PM at Microsoft, building the Agent Reliability Kit at Adotob) published a [framework on 2026-05-21](https://www.fabswill.com/blog/paying-down-supervision-debt-five-control-points/) that names what most agent-security conversations dance around. Five infrastructure control points decide whether an agent reaches production:

| Layer | The question it answers | 2026 operators |
| --- | --- | --- |
| Runtime | Where does the agent live and run? | Cloudflare Agents SDK, AWS Bedrock AgentCore, Vercel AI Gateway, Pipelock |
| Identity | Who is the agent acting for? | Auth0/Okta for AI Agents, WorkOS, Microsoft Entra Agent ID |
| Data | What can the agent know? | Snowflake Cortex Agents, Databricks, governed semantic layers |
| Tool / write access | What can the agent change, with what blast radius? | MCP tool registries and tool descriptions |
| Observability | What did the agent actually do? | Datadog LLM, Arize, signed audit-trail receipts |

Plus a kill switch sitting across all five. Fabian credits Nate B Jones for articulating the lens; the multilayer-kill-switch idea has multiple authors. The frame is correct because compute is no longer the bottleneck. The next bottleneck is "can we govern what the agents actually do," and the answer has to be specific to a control point or it isn't an answer.

The gap between the supervision a system *claims* to ship and the supervision it *actually* ships is what Fabian calls **supervision debt.** The interest payment on supervision debt is the procurement cycle. Every renewal becomes another NDA-protected dashboard review.

This post is about what happened to the runtime layer this week.

## What the MCP 2026-07-28 release candidate changes

David Soria Parra (Anthropic, MCP co-creator) and Den Delimarsky (Microsoft, MCP lead maintainer) [published the RC on 2026-05-21](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/). Spec freezes for SDK validation through the ten-week window; stable lands 2026-07-28.

The headline is one sentence from the RC announcement:

> "Any MCP request can land on any server instance, and the sticky routing and shared session stores that horizontal deployments needed before are no longer required at the protocol layer."

The mechanism is three intertwined changes:

**SEP-2575: handshake removed.** No more `initialize` / `notifications/initialized` exchange. Protocol version, client info, and capabilities now travel in the `_meta` block of every request under the `io.modelcontextprotocol/` namespace. The HTTP transport adds a mandatory `MCP-Protocol-Version` header that must match the `_meta` field or the server returns 400. A new optional `server/discover` RPC replaces capability negotiation; the discovery call is itself stateless.

**SEP-2567: session ID removed.** The `Mcp-Session-Id` header is deleted. There is no protocol-level session concept anywhere. Tools that need to carry state mint explicit handles (`basket_id`, `browser_id`) and the model threads them through subsequent calls as ordinary string arguments.

**SEP-2322: multi round-trip requests.** Server-to-client interactions (elicitation, sampling, listRoots) no longer flow as independent server-initiated requests. The server returns an `IncompleteResult` containing an opaque `requestState`. The client gathers the answers and re-issues the original call with `inputResponses` plus the echoed `requestState`. Any server replica can pick up the retry because all state lives in the payload.

Two other changes matter for runtime mediation specifically:

**SEP-2243: mandatory routing headers.** Streamable HTTP now requires `Mcp-Method` and `Mcp-Name` on every request, and servers must reject mismatches with the JSON-RPC body. The explicit purpose: gateways, rate limiters, and policy engines can route on the operation without parsing JSON-RPC. **These are Pipelock-shaped headers.** Tool-aware runtime policy no longer needs to parse a JSON-RPC body to know which tool a request is invoking.

**SEP-414: W3C trace context.** `traceparent`, `tracestate`, and `baggage` keys are now reserved in `_meta` with fixed names. End-to-end OpenTelemetry visibility ships with the protocol.

Then two new wire-level primitives expand what MCP can carry:

**MCP Apps.** Servers ship UI templates as first-class resources at `ui://` URIs. The client renders them in sandboxed iframes. An agent or human-in-the-loop UI can present a server-supplied form, button, or visualization without out-of-band integration. The trust boundary between the MCP server and the UI shell now has wire-level state crossing it.

**MCP Tasks.** Long-running asynchronous work moves out of the request/response model and into an explicit state machine. A `tools/call` that the server decides to run as a task returns a task handle. The client polls `tasks/get`, the server emits `tasks/update` events as state changes, the client calls `tasks/cancel` to abort. Task IDs carry bearer-token semantics, so the spec requires servers to mint them with high entropy. Tasks can outlive any single connection, by design.

Finally, six auth SEPs harden the OAuth and OIDC interaction: RFC 9207 `iss` validation, OIDC `application_type` declaration during Dynamic Client Registration, credential binding to the authorization server's issuer, refresh-token semantics for OIDC providers, scope accumulation during step-up authentication, and a stable `.well-known` discovery suffix. These are client-side and authorization-server-side changes. They do not touch what crosses the wire between an MCP client and an MCP server at runtime. The RC does NOT introduce DPoP or sender-constrained tokens; the auth hardening is about closing OIDC/OAuth misuse footguns at the client level.

## Why the runtime layer breaks hardest

Every other control point in Fabian's framework gets a graceful upgrade from this RC.

- Identity: the auth SEPs are net positive. Better issuer binding, fewer DCR footguns, scope-creep mitigation.
- Data: unaffected at the protocol layer. Whatever your governed semantic layer was doing, it still does.
- Tool/write registry: the static-spec half of the picture. Tool descriptions still declare what each tool does; the announce-intent-before-action discipline Fabian writes about works the same way.
- Observability: gets W3C trace context for free. Audit-trail receipt patterns (Fabian's Reliability Kit, Pipelock's signed receipts, custom solutions) keep working because they were already per-action, not per-session.

The runtime layer is where the protocol's old security anchors lived, and the RC removes most of them.

**Tool inventory pin loses its scope.** The current MCP spec lets a runtime mediator pin a tool's signature for the duration of a session. Declare-then-call gets a continuity guarantee. Without sessions, a tool's description can change between requests that hit different server replicas, and the wire protocol gives no native way to notice. The threat the binding defends against (server-side tool rug-pull mid-conversation) is not theoretical. The defense has to migrate from session-keyed to principal-keyed with bounded TTL, plus a per-request capability hash so drift is caught at call time.

**Cross-request behavioral correlation loses its key.** Pipelock's chain detection, cross-request entropy emission (CEE), and adaptive enforcement all use the session ID as a correlation key. Under stateless MCP they have nothing to bind to. The fix is a runtime-owned correlation key derived from the authenticated principal, the upstream identity, and a privacy-preserving client fingerprint. The key shape changes; the threats stay.

**Resumable streams are gone.** SEP-2575 explicitly removes resumable SSE streams. Long-running work moves to Tasks. That's protocol-clean but it means anything that monitored a single long-lived stream for behavioral drift has to now correlate `tasks/update` events across replicas.

**Apps and Tasks introduce two new attack surfaces that nobody is covering yet.**

For Apps: a server-supplied UI template renders inside the agent or operator's UI shell. That template can change between requests. If the trust decision was made the first time the template was fetched, subsequent renders need either a content hash check or a drift detection layer. Otherwise an MCP server that wins initial trust can swap the UI silently. The runtime layer needs to scan `ui://` resource content on the wire and either hash-pin per-principal or run template-drift detection.

For Tasks: a task that runs for hours has hours of `tasks/update` traffic. Each update is small. Each update is structured. Across a long enough task, an attacker can leak a sensitive value one fragment at a time and stay under any per-request entropy threshold. This is the slow-drip exfiltration pattern. The runtime mediator has to track entropy across update events within a task, not only across requests.

## What changes for Pipelock

The architectural argument that runtime mediation belongs outside the agent's trust boundary gets stronger under this RC, not weaker. Stateless protocol pushes more state into wire payloads: `requestState` opaque blobs, `_meta` blocks, explicit handles in tool arguments, Tasks update events. All of that is content the agent processes and the in-process tooling sees. None of it is content that survives an agent compromise. Independent mediation at the network or proxy layer is where the wire view lives, and the wire view is the only view that doesn't disappear when the agent does.

Pipelock v2.5 supports the current MCP. The work below is the likely migration path the threat model points to, not a release commitment. The order is compatibility first, then the rest:

1. **Dual-protocol support.** Pipelock recognizes both legacy sessionful MCP and the stateless RC during the SDK adoption window. `MCP-Protocol-Version` is the discriminator. Existing users don't migrate on Pipelock's timeline; they migrate when their SDK does.

2. **Correlation key resolver.** A Pipelock-owned key derived from the authenticated principal (when one exists) plus a privacy-preserving client fingerprint plus the upstream identity. Logged as a fingerprint, not as a token. Replaces `Mcp-Session-Id` everywhere it was used as a correlation anchor.

3. **Baseline store rekeyed.** Tool baselines move to `(upstream, principal, cacheScope)` with bounded TTL. Sensitive tool calls require a fresh-or-valid baseline before enforcement allows them through.

4. **CEE and chain detection rekeyed.** Entropy correlation, subsequence matching, and adaptive enforcement migrate from session/IP semantics to principal/task/correlation semantics. The threats stay the same. The keys change.

5. **New scanning surfaces.** Apps get `ui://` resource hashing and template-drift detection. Tasks get cross-update entropy tracking and slow-drip exfiltration heuristics. Both ship after the correlation layer is solid.

6. **Per-request capability hash (Pipelock extension).** Optional hash carried in `_meta`. A Pipelock client sends it, a Pipelock proxy verifies it, drift is caught at call time. Not in the spec. Pipelock's contribution as a runtime extension after the baseline work is solid.

The signed receipt format Pipelock already emits gets richer under the new spec. `traceparent` becomes a first-class field, `MCP-Protocol-Version` lands in the receipt header, `Mcp-Method` and `Mcp-Name` become indexed metadata. Receipts that an external auditor can verify without a live Pipelock instance, which is the architecture Pipelock 2.5 already shipped, become more useful when the protocol they describe is stateless. Continuity moves from the wire into the receipt chain. That's the move.

## Where Pipelock fits in Fabian's framework, where it doesn't

Pipelock is one row in the five-control-point table. Two rows in practice. The Runtime row, plus the signed-receipt half of Observability that flows into whatever observability stack the buyer chose.

It is not Identity. It is not Data. It is not a tool registry. It is not Datadog or Arize.

The pairing is what Fabian wrote in his post and it's correct: your runtime, your identity, your data, your gateway, plus a receipt. Pipelock is one runtime option among Cloudflare Agents SDK, AWS Bedrock AgentCore, and Vercel AI Gateway. The thing that differentiates it isn't a feature checklist. It's that the mediation lives outside the agent's trust boundary as a Go binary you can run anywhere, and the receipts are signed in a way an external auditor can verify without a privileged account.

Stateless MCP doesn't change that positioning. It sharpens it. The protocol pushed more responsibility into the runtime layer by removing protocol-level continuity. The runtime layer is the one that has to remember things on behalf of everyone else now.

Pipelock v2.5 supports the current MCP. This post is about the next wire model. The runtime questions in here are the ones I'm turning into fixtures and compatibility tests during the RC window.

The work shape is what you'd expect: both protocols held open side by side, the session-ID tracking rebuilt off something else, coverage added for the two new things the spec adds (UI templates and long-running tasks). When and how depends on what the SDKs actually do with the next ten weeks.

If you're running MCP in production and the runtime layer is what you think about, hit me up. I'd rather get the runtime layer right with people running real agents than work it out solo.
