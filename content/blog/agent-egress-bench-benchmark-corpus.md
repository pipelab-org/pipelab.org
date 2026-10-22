---
title: "We built a test corpus for AI agent egress security tools"
linkTitle: "Agent Egress Security Test Corpus"
date: 2026-03-08
lastmod: 2026-08-02
author: "Josh Waldrep"
summary: "72 attack cases across 8 categories. Secret exfiltration, prompt injection, MCP tool poisoning, chain detection. Any security tool can run against it. No vendor lock-in."
description: "Agent Egress Bench: open-source test corpus for AI agent security tools. 72 cases covering secret exfiltration, prompt injection, SSRF, and tool poisoning."
tags: ["ai-security", "benchmark", "mcp", "agent-firewall"]
blog_cat: "comparisons"
updates:
  - date: 2026-08-02
    note: "The corpus has grown to 213 logical cases across 18 categories since this was written."
    link: /gauntlet/
---

Featured in [tl;dr sec #339](https://tldrsec.com/p/tldr-sec-339) and [Detection Engineering Weekly #164](https://www.detectionengineering.net/p/dew-164-your-benign-set-stinks-openai).

Most AI security benchmarks test whether the model behaves correctly. [AgentDojo](https://github.com/ethz-spylab/agentdojo) tests whether the LLM resists prompt injection. [InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent) measures injection success rates. [AgentHarm](https://huggingface.co/datasets/ai-safety-institute/AgentHarm) checks if the model refuses harmful tasks.

These are useful. But they all assume the LLM is the last line of defense.

It isn't. Or it shouldn't be. Models fail. They get tricked by prompt injection, they follow tool-poisoned instructions, they leak secrets when asked nicely enough. That's why security tools exist between the agent and the network: proxies, firewalls, MCP wrappers that inspect traffic before it leaves.

But there was no standard way to test those tools. Every vendor tested against their own internal cases. No shared corpus, no common scoring, no way to compare coverage across categories.

So we built Agent Egress Bench.

## What's in the corpus

[agent-egress-bench](https://github.com/pipelab-org/agent-egress-bench) is 72 test cases across 8 categories:

| Category | Cases | What it tests |
|----------|-------|---------------|
| URL DLP | 14 | Secrets in query strings, encoded paths, high-entropy subdomains, SSRF |
| Request body DLP | 10 | Secrets in POST bodies (JSON, YAML, CSV, multipart, base64, hex) |
| Header DLP | 9 | API keys in HTTP headers (Bearer, JWT, AWS, multi-header) |
| Response injection (fetch) | 8 | Prompt injection in fetched web content |
| Response injection (MITM) | 7 | Injection via tampered TLS-intercepted responses |
| MCP input scanning | 9 | DLP and injection in MCP tool arguments |
| MCP tool poisoning | 7 | Poisoned tool descriptions, schema injection, rug-pull changes |
| MCP chain detection | 8 | Multi-step exfiltration sequences (read-then-send, env-to-network) |

56 malicious cases that should be blocked. 16 benign cases that should be allowed (to test false positive rates). Each case is a self-contained JSON file with the attack payload, expected verdict, severity, capability tags, and a machine-readable reason for the expected outcome.

## How it works

A "runner" connects a security tool to the corpus. The runner feeds each case to the tool, observes whether it blocked or allowed the traffic, and emits JSONL output. Cases the tool can't handle (wrong transport, missing capability) score `not_applicable` instead of `fail`. Nobody gets penalized for not supporting something they don't claim to support.

The repo includes a Go validator (stdlib only, no external deps) that validates case files, runner output, and tool profiles against the spec. A [runner template](https://github.com/pipelab-org/agent-egress-bench/tree/main/examples/runner-template) provides a working skeleton for building new runners.

## What this is not

This is not a leaderboard. There's no rankings page and there won't be one. Each tool publishes its own results independently. The corpus tests observable behavior (did the request get blocked?) not implementation details.

This is also not a model benchmark. If you need to test whether the LLM refuses harmful instructions, use AgentDojo or AgentHarm. If you need to test whether the network security layer catches the attack after the model already failed, use this.

## OWASP mapping

All 8 categories map to the [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/). URL, body, header, and MCP input cases cover ASI02 (Tool Misuse). Response injection cases cover ASI01 (Goal Hijack) and ASI06 (Memory Poisoning). MCP tool poisoning covers ASI04 (Supply Chain). Chain detection covers ASI08 (Cascading Failures). Full mapping with MITRE ATT&CK techniques is in the repo docs.

## Try it

```bash
git clone https://github.com/pipelab-org/agent-egress-bench
cd agent-egress-bench/validate
go build -o aeb-validate .
./aeb-validate ../cases
```

If you build agent egress security tools, [write a runner](https://github.com/pipelab-org/agent-egress-bench/blob/main/docs/ADOPTION.md). If you find a gap in the corpus, [open an issue](https://github.com/pipelab-org/agent-egress-bench/issues). Cases and runners from any vendor are welcome.

The repo is Apache 2.0 licensed. Full docs, governance policy, and contribution guidelines are in the repo.
