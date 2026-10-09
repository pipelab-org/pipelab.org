---
title: "Privacy Policy"
subtitle: "What we collect, what we don't, and why."
description: "Pipelock privacy policy. No telemetry, no analytics in the product. Minimal data collection for license delivery and support."
lastmod: 2026-09-07
suppress_published: true
disable_cta: true
---

*Last updated: September 7, 2026*

This policy covers pipelab.org (the website) and Pipelock (the software). The Waldrep Family LLC ("we", "us") operates both.

The short version: Pipelock the product collects nothing and sends nothing to us. The website and billing collect the minimum needed to deliver your license and process payments.

## What Pipelock (the Product) Collects

Nothing is sent to us. No telemetry. No analytics. No usage tracking. No crash reports. No phone-home. No network calls to our servers. License verification is fully offline using Ed25519 signature checks against a public key embedded in the binary.

Your agent traffic stays on your machine. We never see it.

### What Pipelock Generates Locally

Pipelock runs on your infrastructure and may generate the following data locally on your machine, depending on your configuration:

- **Structured logs.** Request metadata (URLs, hostnames, scan results, actions taken) written to local log files or stdout. You control the log level and destination.
- **Audit events.** Security events (blocked requests, policy decisions, scan findings) that can optionally be forwarded to webhook or syslog destinations you configure. These events may contain request metadata including URLs, client identifiers, and scan results.
- **Reports.** HTML, JSON, or SARIF reports generated on demand via CLI commands. These contain scan findings and request metadata from your environment.
- **Integrity manifests.** SHA256 hashes of workspace files, stored locally for tamper detection. These are cryptographic hashes, not file contents.
- **Session profiling data.** Behavioral scores for agent sessions (request patterns, scan hit rates) used for anomaly detection. Processed in memory per session. Persisted only if you enable logging.
- **Prometheus metrics.** Aggregate counters and histograms exposed on a local endpoint for monitoring. No personally identifiable information.

All of this data stays on your machine unless you explicitly configure forwarding (webhook, syslog) to an external destination. We never receive, access, or process any of it.

You are responsible for the security and retention of locally generated data and for any data you forward to external systems.

## What We Collect When You Buy a License

When you purchase a paid subscription, we collect:

- **Email address.** Used to deliver your license token and send subscription-related emails (renewal notices, receipts). That's it.
- **Payment information.** Processed entirely by [Polar.sh](https://polar.sh), which acts as the merchant of record. We do not receive or store your credit card number. Polar handles card processing, tax calculation, and invoicing.
- **Subscription metadata.** We retain your email, subscription status, plan type, and license issuance dates for customer support purposes.

## What We Collect on This Website

This website uses Google Analytics, PostHog, and Ahrefs Web Analytics to understand how visitors find and use the site. We measure page views, referral sources, device and browser trends, selected call-to-action clicks, outbound link clicks, and 404 page visits. Google Analytics sets cookies in your browser. We use session replay and heatmaps to understand how visitors move through the page layout. Session replay masks all form inputs, so anything you type into a form, such as your email or a message, is never recorded. We capture page interactions, scrolling, and clicks. We do not capture your keystrokes or the contents of any form field.

The interactive Pipelock Playground uses a separate, first-party session cookie to keep one anonymous visit together as a funnel. The demo itself sends only counts, booleans, bounded numbers, and short predefined categories to the playground broker. The broker rejects unknown fields, disables geolocation and person profiles, and then forwards accepted events to PostHog. On that path we do not send prompt text, agent output, verification artifacts, receipt contents, tokens, IP addresses, browser details, or arbitrary strings, and the events arrive from the broker rather than from your browser, so your address is not attached to them. The cookie expires when the browser session ends.

Buttons on the surrounding playground page, such as the one that jumps to the demo and the verify-kit download links, are ordinary website analytics and behave like every other call-to-action click described above. Those go straight from your browser to PostHog and carry what any web request carries, including your IP address.

Some things leave our systems when you run a live playground session. The agent you talk to is a real language model, so what you type is sent to a third-party model provider over the network. We do not control that provider's retention period, whether it uses input to train models, who its own subprocessors are, or what deletion controls it offers, and we are not in a position to promise any of those on its behalf. Treat the playground as a public sandbox: do not type a real credential, a real customer name, or anything else you would not post publicly. Separately, the bot check at the entrance is Cloudflare Turnstile, and it receives your IP address on every attempt to start a session.

A live session runs on a temporary virtual machine that we destroy when the session ends. Our own playground code does not write what you typed to a file or a database, and it does not keep it after the machine is gone. The signed evidence bundle is held in memory for ten minutes so you can download it, rather than being written to disk.

That covers our application and not the infrastructure underneath it. Our hosting provider and our CDN keep ordinary server and edge request logs, which include IP addresses, on retention windows they set rather than we do. If you want something removed, email us at luckypipe@pipelab.org and we will remove what is ours to remove and tell you plainly what is not.

If you email us, we keep the email conversation for support purposes.

## How We Use Your Data

Your email and subscription metadata are used to:

1. Deliver and renew your license token.
2. Send subscription-related emails (receipts, renewal reminders).
3. Respond to support requests.

We do not send marketing emails unless you explicitly opt in. We do not sell, rent, or share your data with third parties, except for Polar.sh (our payment processor, who needs your payment info to process transactions).

## Blockchain Address Data

When enabled, Pipelock may temporarily process blockchain address strings or truncated address fingerprints observed in proxied traffic for the purpose of detecting suspicious address changes, enforcing configured security policies, and generating security events. By default, this information is processed in memory for the active session and is not written to disk by the software itself, except to the extent a customer enables logging, reporting, or other persistence features. Where such identifiers can reasonably be linked to an individual, we treat them as personal data or pseudonymised identifiers and process them solely for security and fraud-prevention purposes.

## Data Retention

We keep your personal data (email address, subscription details) for as long as your subscription is active. After cancellation, we retain your email and subscription metadata for up to 7 years to comply with tax and accounting obligations and to support chargeback resolution.

If you request deletion of your data, we will:

- Delete your email address and any other directly identifying information from our systems.
- Retain anonymized transaction records (subscription dates, plan type, license issuance dates) that can no longer identify you, for accounting and legal compliance.
- Confirm completion of the deletion within 30 days.

Payment records (invoices, receipts, card details) are held by our payment processor, [Polar.sh](https://polar.sh/legal/privacy-policy), not by us. To delete payment data, contact Polar directly through their customer portal.

## Your Rights (GDPR and Otherwise)

If you are in the EU or another jurisdiction with data protection laws, you have the right to:

- Access the personal data we hold about you.
- Correct inaccurate data.
- Request deletion of your personal data (see Data Retention above for what we delete and what we retain in anonymized form for legal compliance).
- Export your data in a portable format.
- Object to processing of your data.

To exercise any of these rights, email [luckypipe@pipelab.org](mailto:luckypipe@pipelab.org). We will respond within 30 days.

## Children

Pipelock is a developer tool. We do not knowingly collect data from anyone under 16. If you believe we have, contact us and we will delete it.

## Changes

If we change this policy, we will update the date at the top. Material changes will be noted on the website.

## Contact

Privacy questions: [luckypipe@pipelab.org](mailto:luckypipe@pipelab.org)
