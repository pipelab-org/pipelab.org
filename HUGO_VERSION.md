# Hugo version authority

`.hugo-version` is the repository's single declaration of the Hugo version
used for builds. GitHub Actions reads it directly.

The Cloudflare build configuration is outside this repository. Its
`HUGO_VERSION` dashboard variable must be set to the same value as
`.hugo-version`. This repository is authoritative for the value, but cannot
enforce the Cloudflare-side setting.
