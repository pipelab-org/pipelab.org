---
title: "Terms of Service"
subtitle: "The rules for using Pipelock and pipelab.org."
description: "Terms of Service for Pipelock and pipelab.org. Covers licensing, acceptable use, payment processing, liability, and termination."
lastmod: 2026-03-15
suppress_published: true
disable_cta: true
---

*Last updated: March 15, 2026*

## Scope and Precedence

These Terms govern: (a) your use of pipelab.org (this website), (b) paid Pipelock subscriptions, license tokens, billing, and support, and (c) your use of the free Community edition of Pipelock downloaded from this website or linked distribution channels.

Pipelock's source code is governed by its respective licenses: Apache 2.0 for the core and Elastic License v2 (ELv2, source-available) for the `enterprise/` directory. Those licenses grant your code rights (use, modify, distribute) independently of these Terms. Nothing in these Terms restricts rights granted by those licenses.

Where these Terms and a code license conflict, the code license governs code rights. These Terms govern everything else: the commercial relationship, subscriptions, tokens, billing, support, website use, and the warranty and liability framework for all users (paid and free).

Marketing materials, documentation, blog posts, comparison pages, and compliance mappings on this website or in the Pipelock repository are for informational purposes only. They do not create warranties, guarantees, or contractual obligations beyond what is stated in these Terms or in a separately signed order form. You acknowledge that you are not relying on any statement, representation, or description outside of these Terms in entering into this agreement or in using Pipelock.

Pipelock is built and maintained by The Waldrep Family LLC ("we", "us", "our"), a Georgia LLC.

## Agreement to Terms

**By using this website, downloading Pipelock, or purchasing a subscription, you confirm that you have read, understood, and agree to these Terms.** If you do not agree, do not use the website, download Pipelock, or purchase a subscription.

For paid plans, acceptance is confirmed at the point of purchase through our payment processor via a required terms-acceptance checkbox. By completing a purchase, you represent that you have the authority to enter into this agreement and to bind the entity on whose behalf you are purchasing.

For free Community users, your code rights come from Apache 2.0 or ELv2. These Terms additionally govern the warranty, liability, and risk framework that applies to all users of Pipelock, whether paid or free.

## Customer Representation

By purchasing a Pipelock subscription, you represent that:

1. You are acting on behalf of a business, organization, or professional practice and have the authority to bind that entity to these Terms. Pipelock subscriptions are intended for business and professional use.
2. You have the technical competence to evaluate whether Pipelock meets your security requirements.
3. You understand that Pipelock is self-hosted software that you download, install, operate, and configure on your own infrastructure. We do not operate, host, manage, or monitor your deployment.
4. You are solely responsible for the security of your environment, including any systems, credentials, agents, or traffic that interact with Pipelock.
5. You are responsible for compliance with all applicable laws in your jurisdiction, including export controls, data protection, and any industry-specific regulations.

## Licensing

Pipelock's core code is licensed under Apache 2.0. The `enterprise/` directory is licensed under ELv2 (source-available, not open-source). You may not provide enterprise-licensed code as a managed service or remove license-key enforcement. The full license texts are included in the repository.

Paid plans are activated by Ed25519-signed license tokens. Each token encodes your licensed scope and expiration. The token is verified locally by the binary. There is no phone-home, no activation server, and no telemetry.

Your license token is for your organization's internal use. Don't share it publicly or redistribute it to third parties.

## Payment Processing

All payments are processed by [Polar.sh](https://polar.sh), which acts as the merchant of record. We do not store your credit card number or payment credentials. Polar handles billing, tax collection, invoicing, and refund processing on our behalf. Refunds are governed by our [Refund Policy](/refund/).

By purchasing a subscription, you also agree to [Polar's Terms of Service](https://polar.sh/legal/master-services-terms).

## Acceptable Use

Use Pipelock however you want, with two exceptions:

1. Don't use it for anything illegal in your jurisdiction.
2. Don't reverse-engineer the license verification to bypass paid features.

That's it. We're not going to micromanage how you deploy a security tool.

## Nature of the Software

Pipelock is self-hosted security software, not a managed service. You download it, run it on your infrastructure, and configure it yourself. We do not operate, monitor, or have access to your deployment.

Pipelock scans network traffic for patterns consistent with credential exfiltration, prompt injection, SSRF, tool poisoning, and other threats. It enforces user-configured policies including allowlists, blocklists, rate limits, and approval workflows.

All detection is pattern-based and probabilistic. Pipelock may produce false positives, false negatives, or miss novel attack techniques. It is one layer of a defense-in-depth approach and should not be relied upon as the sole security control for any system, workflow, or transaction.

Pipelock includes optional process sandboxing on Linux (Landlock filesystem restrictions, seccomp system call filtering, and network namespace isolation) and macOS (sandbox-exec profiles, alpha). These features restrict the sandboxed process at the OS level but do not replace container isolation, VM boundaries, or your organization's existing security controls. The sandbox is one layer of containment. It should not be relied upon as the sole isolation mechanism for untrusted workloads.

Pipelock also provides content inspection and policy enforcement for network traffic and MCP tool calls.

### TLS Interception

When TLS interception is enabled, Pipelock acts as a TLS-terminating proxy to inspect encrypted traffic between the agent and upstream servers. You are responsible for:

- Ensuring your use of TLS interception complies with applicable laws in your jurisdiction.
- Managing the certificate authority used for interception.
- Informing any users or systems whose traffic passes through the proxy.

We do not operate the proxy, manage your certificates, or see any intercepted traffic.

### Event Emission

Pipelock can forward security events (blocked requests, scan results, policy decisions) to user-configured destinations via webhook or syslog. These events may contain request metadata such as URLs, hostnames, scan results, and client identifiers. You are responsible for the security and privacy of any destination you configure and for compliance with applicable data protection laws.

### Compliance Mapping

Documentation on this website and in the Pipelock repository maps product features to security frameworks (OWASP, EU AI Act, NIST AI RMF). These mappings are for informational purposes only. They do not constitute legal advice, regulatory certification, or a guarantee of compliance with any framework or regulation. Consult qualified legal counsel for compliance obligations specific to your systems.

## Digital Asset and Blockchain Features

Certain Pipelock features may inspect network traffic associated with blockchain, wallet, or digital-asset systems solely to identify security signals and to enforce customer-configured policies.

Pipelock does not custody assets, hold or transmit private keys, submit or settle transactions, execute trades, act as a broker, exchange, transfer agent, money transmitter, investment adviser, or crypto-asset service provider, and does not provide legal, tax, investment, or financial advice.

Pipelock's address-pattern detection is not anti-money laundering (AML) screening, sanctions list checking (OFAC, EU, UN, or otherwise), know-your-customer (KYC) verification, blockchain analytics, or a substitute for any regulatory compliance program. Address detection covers only the specific address formats and configurations enabled in your deployment and may not cover all chains, token standards, or encoding variations.

Detection and policy decisions are probabilistic and may produce false positives, false negatives, or missed events. Customer remains solely responsible for verifying recipient addresses, transaction details, counterparties, sanctions compliance, and the appropriateness of any digital-asset transfer, and for requiring independent human review before material transfers of value.

### Export Controls

Pipelock may be subject to U.S. export control laws and regulations, including the Export Administration Regulations (EAR). You are responsible for complying with all applicable export and re-export restrictions. You may not download, use, or distribute Pipelock in violation of U.S. export controls or to any person, entity, or destination prohibited by applicable sanctions or export control laws.

## Disclaimer of Warranties

**PIPELOCK IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.**

**WE DO NOT WARRANT THAT PIPELOCK WILL DETECT ALL THREATS, PREVENT ALL SECURITY INCIDENTS, BLOCK ALL UNAUTHORIZED ACCESS, OR FUNCTION WITHOUT INTERRUPTION OR ERROR. SECURITY THREATS EVOLVE. DETECTION PATTERNS MAY NOT COVER NEW, NOVEL, OR OBFUSCATED ATTACK TECHNIQUES.**

**YOU ARE RESPONSIBLE FOR EVALUATING WHETHER PIPELOCK MEETS YOUR SECURITY REQUIREMENTS AND FOR MAINTAINING ADDITIONAL SECURITY CONTROLS APPROPRIATE TO YOUR RISK PROFILE. PIPELOCK IS ONE LAYER IN A DEFENSE-IN-DEPTH APPROACH AND SHOULD NOT BE YOUR SOLE SECURITY CONTROL.**

## Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE WALDREP FAMILY LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE PIPELOCK, REGARDLESS OF THE CAUSE OF ACTION OR THE THEORY OF LIABILITY. THIS INCLUDES BUT IS NOT LIMITED TO: LOST DATA, LOST PROFITS, LOST REVENUE, BUSINESS INTERRUPTION, SECURITY INCIDENTS, UNAUTHORIZED ACCESS, AND FINANCIAL LOSSES OF ANY KIND, INCLUDING LOSSES INVOLVING DIGITAL ASSETS, CRYPTOCURRENCY, OR BLOCKCHAIN TRANSACTIONS.

OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR YOUR USE OF PIPELOCK SHALL NOT EXCEED THE TOTAL AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.

FOR USERS OF THE FREE COMMUNITY EDITION WHO HAVE PAID NOTHING, OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED FIFTY U.S. DOLLARS ($50).

## Acknowledgment of Risk

You acknowledge that no security software can guarantee complete protection against all threats. Pipelock is designed to reduce risk, not eliminate it. You agree to use Pipelock as part of a broader security strategy that includes independent verification, human oversight, and additional security controls appropriate to your environment and risk tolerance.

## Indemnification

You agree to indemnify, defend, and hold harmless The Waldrep Family LLC from and against any third-party claims, damages, losses, liabilities, and expenses (including reasonable legal fees) arising out of or related to: (a) your violation of these Terms, (b) your use of Pipelock in violation of applicable law, or (c) your negligent or willful misconduct in connection with your use of Pipelock.

We will provide you with prompt written notice of any such claim and will reasonably cooperate with your defense at your expense. You may not settle any claim without our prior written consent if the settlement would impose obligations on us or admit fault on our behalf.

## Termination

You can stop using Pipelock at any time. Cancel your subscription through the Polar customer portal or email us at [luckypipe@pipelab.org](mailto:luckypipe@pipelab.org).

We can terminate your license if you violate these terms. If we do, we will tell you why. Community (free) usage under Apache 2.0 is not affected by license termination. Sections that by their nature should survive termination (Disclaimer of Warranties, Limitation of Liability, Indemnification, Governing Law) will survive.

## Changes to These Terms

We may update these terms. If we make a material change, we will update the date at the top of this page and, for active subscribers, notify you by email. Continued use of paid features after a change means you accept the new terms. If you do not agree with material changes, you may cancel your subscription.

## Severability

If any provision of these Terms is held to be unenforceable, the remaining provisions remain in full force and effect. The unenforceable provision will be modified to the minimum extent necessary to make it enforceable while preserving its original intent.

## Entire Agreement

These Terms, together with the applicable code license (Apache 2.0 or ELv2), the [Privacy Policy](/privacy/), the [Refund Policy](/refund/), and for paying customers, [Polar's Terms of Service](https://polar.sh/legal/master-services-terms) (which governs only the payment-processor relationship), constitute the entire agreement between you and The Waldrep Family LLC regarding your use of Pipelock and the website. Any prior or contemporaneous agreements, representations, or understandings are superseded.

Enterprise customers with separately signed order forms, service agreements, or statements of work: those documents take precedence over these Terms to the extent of any conflict.

## Governing Law and Jurisdiction

These terms are governed by the laws of the State of Georgia, USA, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved exclusively in the state or federal courts located in Georgia, USA. You consent to personal jurisdiction in those courts.

## Contact

Questions about these terms: [luckypipe@pipelab.org](mailto:luckypipe@pipelab.org)
