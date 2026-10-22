---
title: "A secret scanner that blocks git push gets turned off"
linkTitle: "Credentials Have an Audience"
date: 2026-10-02
author: "Josh Waldrep"
summary: "Blocking every GitHub token everywhere breaks the most ordinary thing an agent does, so operators exempt the whole host or switch the rule off. The better question is where the credential is going, and the providers already publish the answer."
description: "Blocking every GitHub token everywhere breaks git push, so the rule gets switched off. Ask where the credential is going, not only whether it is one."
tags: ["dlp", "false-positives", "ai-security", "agent-egress", "credentials"]
blog_cat: "technical"
faq:
  - q: "What is a credential audience?"
    a: "The set of hosts a credential is meant to be sent to. A GitHub token's audience is GitHub's API and git endpoints. A Slack token's audience is Slack's API. Sending it there is normal use. Sending it anywhere else is a leak."
  - q: "Why not just exempt github.com from secret scanning?"
    a: "An exemption weakens whatever detector or traffic surface it names, for every request that matches it, and the operator has to decide how wide that is. An audience allow covers one credential class at its provider hosts, with additional header or git-path restrictions for GitHub, GitLab and Google OAuth, and nothing else in the request inherits it."
  - q: "Can an agent still misuse a credential that goes to the right place?"
    a: "Yes. An audience check answers where the credential goes, not what the request does with it. A valid token sent to the real API can still write data somewhere public. That's a policy and scope problem, and the rest of the request is still scanned."
---

A DLP rule that blocks a GitHub token on its way to GitHub is a broken rule. You find that out the first afternoon your agent tries to `git push`.

The agent has a token because you gave it one. It uses the token to talk to the service that issued it. That's the job. But a secret scanner that only asks "is this a credential?" sees `ghp_` followed by thirty-six characters and blocks it. So the usual fixes are to exempt `github.com` from scanning or turn the rule off. Both get the push working. The exemption stops that check for everything headed to GitHub that matches it, including a token the agent pastes into a public repo or gist. Turning the rule off means nothing checks where that token goes at all.

I've written about this failure before in the context of [benign test sets](/blog/benign-set-should-look-malicious/). Rules die from false positives more often than they die from misses. A credential rule that fires on the credential's own home is the purest version of that.

## The wrong question

"Is this a secret?" is the right first question and the wrong last one. The shape tells you what the thing is. Where it's headed tells you whether you have a problem.

A Slack bot token sent to `slack.com` is a bot doing bot things. The same token sent to a paste site is a breach. The bytes are identical. The destination is the whole difference, and a rule that can't see the destination has to pick between blocking legitimate work and allowing a leak.

So the question has two halves. Is this a credential, and is this the party that issued it?

## The providers already published the answer

You don't have to guess where a GitHub token belongs. GitHub documents it. REST calls go to `api.github.com` with an `Authorization` header. Release uploads go to `uploads.github.com`. Git over HTTPS goes to `github.com` on a small set of transport paths, `info/refs`, `git-upload-pack`, `git-receive-pack` and the LFS paths, defined in git's own protocol docs. Slack documents its API authority. Google documents that OAuth access tokens ride a Bearer header to `googleapis.com`. Anthropic, OpenAI, Hugging Face, Groq and most of the rest publish where their keys go.

That's what "audience" means here. It's a word borrowed from token standards, where a token names who it's for. Most API keys don't carry that field, but the provider's docs do the same job. The audience is written down. A scanner can read it.

## Why it can't be a config option

The obvious way to build this is a YAML list, where each credential gets a list of allowed hosts. I didn't build it that way, on purpose.

Think about who edits config on an agent host. Sometimes it's the operator. Sometimes it's the agent, because the agent has a shell and the config file is a file. An agent that has been talked into leaking a token by something it read doesn't need to beat the scanner if it can add one line that says the attacker's host is a valid destination for GitHub tokens. A setting that widens where a credential may travel is itself an exfiltration lever.

So in [Pipelock 3.6](/blog/pipelock-v360-release/) the audience sets are compiled in, one per credential class, tied to provider docs in the [provider key coverage table](https://github.com/pipelab-org/pipelock/blob/main/docs/security/provider-key-dlp-coverage.md). The table flags the few bindings carried over without independent verification. A GitHub token earns the allow only on an `Authorization` header at the API hosts, or as Basic auth on a git transport path at `github.com`. Put the same token in a URL, a body field, a different header, or a non-git path on `github.com`, and it still blocks. A percent-encoded path or one with `..` segments doesn't qualify. The connection has to be encrypted, and Pipelock has to be able to see inside it, which means TLS interception for HTTPS going through the forward proxy. A plain CONNECT tunnel is opaque bytes. Every allow is recorded in the audit log. With receipt signing set up and the recorder writing successfully, it also gets a signed receipt.

There's one place the operator does get a say, because no compiled list can know it. A company running GitHub Enterprise or self-managed GitLab has its own host. Those go in `dlp.github_enterprise_hosts` and `dlp.gitlab_hosts`, one exact name each. The docs say plainly what that means: a host you declare receives the credential by design, so declare only hosts you control.

A SigV4 signature isn't the secret key, so it's handled separately. AWS secret keys and private keys get no audience at all. There's no single host they belong to, so they stay blocked everywhere.

## What it doesn't do

An audience check answers where the credential goes. It doesn't answer what the request does with it.

A valid GitHub token sent to the real GitHub API can still create a public gist full of your source code. The token went home. The data didn't. That's a scoping problem, and the fix lives upstream: tokens with the narrowest permissions the job allows, fine-grained over classic, short-lived over permanent. The audience allow covers that one credential. Everything else in the request is still scanned, and the rest of the scanner pipeline still runs.

It's also no substitute for keeping the agent's traffic going through the scanner in the first place. If the agent can reach the internet directly, none of this matters. Run it [contained](/learn/verifiable-egress-control/) or behind network policy.

## The bar

A rule has to survive a normal workday or it gets deleted. For credentials, a normal workday means the agent uses its keys, constantly, at the hosts that issued them. A scanner that can't tell that apart from a leak ends up either blocking everything or switched off.

If you run secret scanning on agent traffic, with Pipelock or anything else, try this. Give the agent a real token and ask it to push a branch. If the rule fires, you're looking at the same choice, exempt the host or turn it off. Check the same token against an unrelated destination too. It should still block there.
