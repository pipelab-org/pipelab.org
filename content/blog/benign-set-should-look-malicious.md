---
title: "Your benign set should look malicious"
linkTitle: "Benign Set Should Look Malicious"
date: 2026-07-17
author: "Josh Waldrep"
summary: "A detection's false-positive rate is meaningless if the benign test set never looks like an attack. The negatives that break real rules are the ones that carry attack-shaped content. Here is how to build them."
description: "A detection's false-positive rate is meaningless if the benign set never looks like an attack. Build hard negatives that stress the rules that matter."
tags: ["detection-engineering", "false-positives", "ai-security", "benchmarking"]
blog_cat: "technical"
---

A 0.1% false-positive rate against clean traffic means nothing. The test proved a detector can ignore a health-check ping and a plain JSON API call. Nobody was worried about those. The traffic that trips a real detector is the stuff that looks like an attack and isn't one, and if your benign test set has none of that in it, your false-positive rate is a participation trophy.

I write detections for AI agent egress, so I see this a lot. An agent reads a security advisory that quotes a prompt-injection string. It calls a scanner whose tool description lists SQL injection, XSS, and SSRF. A tutorial it pastes has AWS's own fake key in it, `AKIAIOSFODNN7EXAMPLE`. A log it summarizes says "token expired" and "401 unauthorized" a few hundred times. Normal work, all of it, covered in the exact features a naive rule is built to catch.

That's the problem. Your benign set has to look malicious, or it isn't testing anything.

## The easy-negative trap

Precision and recall are old news. Detection engineers have been fighting false positives in SIEM and EDR for years, so this isn't new math. The trap is quieter than that.

When you build a benign corpus, most people grab obvious clean traffic. A GET to a public API. A form submission. A CDN fetch. Your detector sails through all of it, you write down a beautiful number, and you ship. But you never asked it the ugly question: what does the rule do when a harmless input is wearing an attacker's clothes? Test only the easy negatives and you measured the wrong thing. You measured whether the rule stays quiet when nothing looks scary. That was never the risk.

## Hard negatives

A hard negative is a benign input that carries the same surface features as an attack. The word "token" with no token behind it. A base64 blob that decodes to a PNG, not a secret. A tool schema that names ten attack types because naming them is the tool's job. A quoted injection payload sitting in a paragraph that explains the injection.

These are the samples that expose a jumpy detector. Everything else is filler. If your benign set is 400 clean API calls and zero lookalikes, you can ace the false-positive side with a regex that matches nothing, and you'll have proven exactly that much.

## Agent egress makes it worse

Classic network detection had a lot more boring benign traffic to lean on. Agent traffic gives you less of it.

An agent's whole job is to move text between systems. It reads docs, runs scanners, opens source code, and forwards the mess somewhere else. So the benign stream fills up with attack-shaped text that isn't an attack, and credential-shaped text that leaks nothing. The signal a naive DLP or injection rule keys on shows up in legitimate traffic all day. Skip testing against that and your first week in production is one long false-positive incident, and your operators rip the rule out. I've watched that failure mode kill more rules than misses ever did.

## The examples that break lazy detectors

Here is the shape of a hard-negative table. Every row is benign, and every row looks like it shouldn't be.

| Sample | Why it looks dangerous | Why it can be legitimate | What a real detector inspects |
|--------|------------------------|--------------------------|-------------------------------|
| A doc that quotes `ignore all previous instructions...` | It contains a known injection string | It's describing the attack, not issuing it | Is the string quoted or fenced, or is it live in the instruction path? |
| Tutorial with `AKIAIOSFODNN7EXAMPLE` | It matches the AWS key format | It's AWS's published example value, in every guide | Is it the documented constant, in a code-example context? |
| Scanner tool description listing XSS, SSRF, injection | The schema is full of attack terms | The tool advertises what it detects | Is the tool invoking those, or naming them? |
| `token expired`, `401 unauthorized` in a log | The keywords "token" and "auth" | It's an error message with no credential in it | Is there an actual secret, or only the word? |
| A base64 image data URI | A long high-entropy blob | It decodes to an inline PNG | Does it decode to an image, or to a key or a command? |
| A UUID in a URL path | A long random-looking string | It's a resource id | Is the entropy in a credential position or an id position? |

None of this is rare. This is where a rule earns its keep or gets uninstalled.

## Build your own set

You cannot download the negatives that matter for you. The ones that break your rules come from your own mess: docs, runbooks, CI logs, scanner output, support tickets, example credentials, encoded fixtures, tool schemas. That's where your agents' benign traffic comes from, so that's where your lookalikes live.

Pull from those sources. Label each sample against the policy you mean to enforce. Keep a private holdout the detector never sees during tuning. The holdout is the part people skip, and it's the part that stops you from overfitting to your own test set and calling it precision.

## Report it honestly

A single false-positive rate lets you hide the important part. Split it. Report the rate on easy negatives and the rate on hard negatives as two numbers, because the gap is the finding. A detector at 0% on clean traffic and 30% on lookalikes panics the second benign traffic looks dangerous. Calling that 0.3% is laundering the result.

Declare the unit while you're at it. False-positive rate per what: per request, per session, per URL, per document chunk, per tool call, per alert? A rate without a denominator is mush, and vendors pick the denominator that flatters them.

Then show the misses. When I run my own tests, the failures get published right next to the score. If nobody can see the failures behind a number, that's a claim, not a measurement. Report only the wins and you're doing marketing, not detection engineering.

## The annoying caveat

Whether a given hard negative should be allowed or blocked depends on your policy, not on some universal truth. Plenty of shops block any AWS-key-shaped string on sight, example value or not, and that's a defensible call. So label each sample against your policy and don't pretend it's universally safe. The benchmark has to state that policy out loud. A hard-negative set with no declared policy boundary still beats clean traffic, but it's an argument waiting to happen.

## The point

A detection earns its false-positive rate by staying calm when benign traffic looks like an attack. If it never met dangerous-looking benign traffic in testing, it hasn't earned anything yet, no matter how good the number looks.

I keep a public starter set of these lookalikes in [agent-egress-bench](https://github.com/luckyPipewrench/agent-egress-bench). It's tool-neutral, so run it against whatever you use. But treat it as a seed. The negatives that will break your rules are the ones from your own docs and logs, your own tools, and nobody can build those for you.

---

*Featured as the Detection Engineering Gem in [Detection Engineering Weekly #164](https://www.detectionengineering.net/p/dew-164-your-benign-set-stinks-openai).*
