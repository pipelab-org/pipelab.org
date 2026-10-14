---
title: "Pipelock Known Limitations: What It Does Not Catch"
linkTitle: "Known Limitations"
subtitle: "A standing, public register of what Pipelock does not protect against. Honesty is the moat."
description: "A standing register of what Pipelock does not catch: process-level bypass, non-HTTP exfiltration, covert channels, and semantic prompt injection."
date: 2026-06-13
lastmod: 2026-06-13
learn_cat: concepts
level: ref
tags:
  - limitations
  - evidence
  - concepts
faq:
  - q: "What does Pipelock not protect against?"
    a: "Pipelock is a network and tool proxy, not a sandbox. It does not stop process-level attacks that bypass the proxy, non-HTTP exfiltration through channels it does not mediate, a compromised model, pixel-level steganography, or covert channels like timing and HTTP/2 frame flags. It has partial coverage of semantically novel prompt injection and very slow exfiltration. Each gap has a documented mitigation, usually a deployment control such as container network isolation."
  - q: "Why publish a limitations list at all?"
    a: "Because a security tool that claims full coverage is the one to distrust. A standing public register lets a reviewer see exactly where the boundaries are and decide what residual risk they accept. It is the same reason Pipelock signs evidence instead of asserting non-bypass: verifiable honesty beats an unverifiable guarantee."
  - q: "Does Pipelock catch homoglyphs and field-split secrets?"
    a: "Yes, those are tested and handled, not gaps. The normalization pipeline maps 80-plus confusable characters across major scripts, and cross-request reassembly plus ordered subsequence matching catches secrets split across query parameters and across transports in a session. The real residual gaps are listed below: they are about channels Pipelock does not mediate and attacks that are semantic rather than syntactic."
---

Pipelock publishes what it cannot catch. A security control that claims full coverage is the one to distrust, and a reviewer needs the boundaries drawn to decide what residual risk is acceptable. This page is the standing register. It tracks the documented gaps and, per release, the false-positive and true-positive picture.

The authoritative engineering source is the [bypass resistance doc](https://github.com/luckyPipewrench/pipelock/blob/main/docs/bypass-resistance.md), which lists the evasion techniques Pipelock handles alongside the ones it does not. This page is the operator-facing summary.

## Out of scope

These are outside what a network and tool proxy can see. If your threat model includes them, you need an additional control, named in the mitigation column.

| Limitation | Why | Mitigation |
|------------|-----|------------|
| Process-level attacks | Pipelock mediates traffic, it does not isolate the process. An agent that can exec arbitrary processes can open a channel that never touches the proxy. | Pair with an OS sandbox (Docker, gVisor, Firecracker) and containment. |
| Non-HTTP exfiltration | A write to a cloud-synced folder, the clipboard, stdout, or a subprocess that does not use the proxy never reaches Pipelock. | Container network isolation so the only egress path is the proxy. |
| Model compromise | If the model itself is fine-tuned to be malicious, Pipelock cannot read intent. It sees the network-visible symptoms, not the motive. | Defense in depth across the four functions. |
| Pixel-level steganography | Data hidden in image pixels or audio or video sample bits is beyond content inspection. Pipelock strips EXIF, XMP, IPTC, and ICC metadata, so metadata-based steganography is covered, but pixel-level encoding is not. | Specialized media analysis if your threat model needs it. |
| Covert channels | Timing, header ordering, and HTTP/2 frame flags carry bits outside the URL and body content layer. Detecting them needs protocol-level analysis beyond content inspection. | Documented gap. Containment limits the reachable channels. |

## Partial coverage

These are mediated but not absolute. Pipelock reduces the risk without closing it.

| Limitation | Detail | Mitigation |
|------------|--------|------------|
| Semantic prompt injection | Injection detection is pattern-based, so it is syntactic, not semantic. An injection crafted to match no known pattern can pass. | Add custom patterns for your domain. Treat detection as one of four functions, not the whole defense. |
| Very slow exfiltration | A drip of one byte per hour over days sits below any practical rate limit or entropy threshold. | Container isolation prevents it. Without isolation, this is the residual risk. |
| Misconfiguration | Audit mode logs without blocking. An operator who never switches to balanced or strict enforces nothing. | Start in balanced mode. Use `pipelock audit` to generate a tuned config. |
| IPv6 reachability | If the internal CIDR list omits IPv6 ranges, an agent could reach internal services over IPv6. | The default config includes the standard IPv6 private and multicast ranges and strips zone IDs before parsing. |
| Unintercepted CONNECT | On a plain HTTPS CONNECT tunnel without TLS interception, only the destination host is visible, not the path, body, or response. | Enable TLS interception for full content coverage on CONNECT traffic. |

## False-positive and true-positive rates

Detection quality is a moving target, so it gets reported, not asserted. The measurement source is the public [agent egress benchmark](https://github.com/luckyPipewrench/agent-egress-bench): a tool-neutral corpus of attack and benign cases scored by an open runner, plus Pipelock's in-repo evasion test suite for the encoding and Unicode classes.

When a benchmark run is recorded, the measured figures are published here: the benign-traffic false-positive rate and the attack-corpus true-positive (catch) rate, with the corpus version and date. The numbers always come from a real run, never an estimate, and they are not posted on a fixed per-release schedule. Between updates, the [benchmark repo](https://github.com/luckyPipewrench/agent-egress-bench) holds the current public corpus and runner, so anyone can reproduce the score independently.

No measured snapshot has been recorded here yet.

## v3.7 evidence and launch limits

[Cooperative command launch](/learn/pipelock-exec/) sets proxy and CA environment variables, which a command can ignore. Operating-system enforcement still needs containment, sandboxing or network policy. Containment filesystem enforcement is off for existing configs that omit the new mode. Enforce mode retains user-namespace remount, same-user process, socket and operator-written-unit limits.

[Parallel receipt chains](/learn/parallel-receipt-chains/) need complete-group verification. An open prefix isn't a complete run, and a recovery seal doesn't repair damaged evidence. Native AEL streams have a 256 MiB verifier ceiling the writer doesn't cap. Receipt content scanning checks whole values but uses bounded fragment reassembly and excludes process-proven generated IDs. Review the [full receipt content boundary](https://github.com/luckyPipewrench/pipelock/blob/main/docs/guides/receipt-verification.md#receipt-content-boundary).

## Where to go next

- [What Pipelock claims and does not claim](/learn/non-bypass-doctrine/) for the doctrine behind this register
- [Defining the agent security category](/learn/agent-security-model/) for the four functions these gaps map to
- [Bypass resistance (engineering source)](https://github.com/luckyPipewrench/pipelock/blob/main/docs/bypass-resistance.md) for the technique-by-technique detail
