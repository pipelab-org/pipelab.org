---
title: "OBLITERATUS Stripped Your Model's Safety. The Network Layer Is What's Left."
linkTitle: "When the Model Won't Refuse"
date: 2026-03-05
author: "Josh Waldrep"
summary: "OBLITERATUS and similar tools remove safety guardrails from open-weight models using weight ablation. When the model won't refuse, your only defense is the network layer."
description: "OBLITERATUS strips refusal training from open-weight models via weight ablation. When the model won't say no, the network layer is your last defense."
tags: ["ai-security", "agent-firewall", "pipelock", "dlp"]
blog_cat: "technical"
---

Safety guardrails are supposed to be the first line of defense. The model refuses harmful requests, declines to exfiltrate data, and won't help write malware.

What happens when someone deletes them?

## Weight ablation is real

[OBLITERATUS](https://github.com/elder-plinius/OBLITERATUS) uses singular value decomposition (SVD) to identify the exact weight components responsible for refusal behavior in open-weight models. It surgically removes them. The result is a model that performs identically on benchmarks but never says no.

This isn't new. Abliterator, refusal-ablation, and similar tools have been around since mid-2025. OBLITERATUS packaged it better: 11 ablation techniques, automatic layer detection, 116 curated models across 5 compute tiers. Over 1,200 stars and 200+ forks on GitHub.

The technique works because refusal behavior in transformer models concentrates in a small number of residual stream directions. Remove those directions and the model loses the ability to refuse while keeping everything else intact. It's not fine-tuning on harmful data. It's weight surgery.

## Why this matters for agent security

Most agent security thinking assumes the model will cooperate. Guardrails are "defense layer one." If someone tells the agent to exfiltrate credentials, the model is supposed to say no.

Ablated models won't say no. They comply with every request. And they're increasingly common in self-hosted setups, research environments, and red-team rigs.

Three scenarios where this bites you:

**Your own ablated model.** You're running an uncensored model for research or red-teaming. It follows every instruction, including injected ones from tool responses. A poisoned MCP server or a malicious webpage tells the agent to read your SSH keys and send them somewhere. The model says "sure."

**Supply chain injection.** Someone publishes a "fine-tuned" model that's actually ablated. You download it from HuggingFace, deploy it as your coding assistant, and it happily follows injected instructions because refusal was removed before you got it.

**Multi-agent compromise.** One agent in your pipeline uses an ablated model. An attacker injects instructions through that agent's tool responses. The ablated agent follows them, and now the compromised agent can influence other agents in the pipeline through shared context or tool calls.

## The model won't protect you. The network layer will.

This is where the architecture matters. If your entire security model depends on the model refusing harmful requests, ablation defeats it completely. You need a layer that doesn't care what the model thinks.

An [agent firewall](/agent-firewall/) sits between the agent and everything it touches. It doesn't ask the model whether a request is safe. It scans the traffic.

```
Agent (ablated model, will comply with anything)
  │
  ▼
Agent Firewall (scans traffic, doesn't care about model intent)
  │
  ▼
Internet / MCP Servers / Tools
```

The firewall catches credential exfiltration regardless of whether the model intended to leak them. It catches prompt injection in tool responses regardless of whether the model would have resisted. The model's guardrails are irrelevant because the firewall operates at the network layer, not the inference layer.

## What to scan for

When the model has no guardrails, you need tighter thresholds everywhere.

**DLP scanning.** Every pattern at critical severity. No "low" or "medium" classifications. An ablated model will happily include your AWS keys in any request if instructed to. Every match should block.

**Rate limiting.** Lower thresholds. An unrestricted model will make more requests faster because it never pauses to evaluate whether a request is appropriate. 15 requests per minute instead of 30.

**Entropy detection.** Lower the threshold. Base64-encoded secrets, hex-encoded tokens, any high-entropy string in a URL or request body is suspicious. 3.0 bits per character instead of 3.5 catches more encoded payloads at the cost of more false positives. Worth the trade-off when the model is actively cooperating with every instruction.

**Exfiltration domains.** Block paste sites, webhook receivers, ngrok tunnels, and transfer services by default. An unrestricted model won't think twice about sending data to requestbin.com or webhook.site.

**Tool policy.** Block curl, wget, nc, and network tools in shell commands. Block environment dumps (printenv, env, export -p). An ablated model will run any command it's asked to run.

**Session binding.** Pin the tool inventory at session start. If a new tool appears mid-session, block it. An attacker could introduce a malicious tool knowing the model won't question it.

## Detecting ablated models in your project

Pipelock's [`audit` command](https://github.com/pipelab-org/pipelock) now detects guardrail-removal toolchains in your project directory. Run `pipelock audit .` and it checks for:

- **Python packages:** obliteratus, abliterator, refusal-ablation, llm-abliterator in requirements.txt or pyproject.toml
- **Ablation scripts:** abliterate.py, abliteration.py, remove_refusals.py, uncensor.py

If it finds any, it flags them and recommends the hostile-model config preset:

```bash
$ pipelock audit .
  ⚠ Guardrail-removal toolchain detected: obliteratus.
    Consider using the hostile-model config preset.
```

The [hostile-model preset](https://github.com/pipelab-org/pipelock/blob/main/configs/hostile-model.yaml) enables every defense layer at maximum sensitivity. All DLP patterns at critical severity, aggressive entropy detection, expanded exfiltration blocklist, tool policy blocking network and environment commands, session binding, and a preconfigured kill switch.

```bash
pipelock run --config configs/hostile-model.yaml
```

## The uncomfortable truth

Model-layer safety and network-layer safety solve different problems. Guardrails reduce the chance that a model *cooperates* with a harmful request. A firewall reduces the chance that harmful traffic *succeeds* regardless of cooperation.

Ablation tools remove the first layer. They can't remove the second. You can't SVD your way past a network proxy that blocks requests containing `sk-ant-` patterns.

If you're running self-hosted models, especially uncensored ones, put a firewall in front of them. The model won't protect you. The network will.

---

*[GitHub](https://github.com/pipelab-org/pipelock) // [Hostile model preset](https://github.com/pipelab-org/pipelock/blob/main/configs/hostile-model.yaml) // [OWASP Agentic Top 10 mapping](https://github.com/pipelab-org/pipelock/blob/main/docs/owasp-mapping.md)*
