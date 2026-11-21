Source: {{ .Permalink }}

# {{ partial "hub-md-label.html" .Title }}

{{ $l := .Params.hub.listing -}}
{{ if $l -}}
ID: {{ $l.id }}

{{ partial "hub-md-text.html" $l.summary }}

## Maintainer

{{ partial "hub-md-label.html" $l.maintainer.name }}

{{ partial "hub-md-label.html" $l.maintainer.github }}

License: {{ partial "hub-md-label.html" $l.license }}

## Setup
{{ range $l.setup }}
{{ partial "hub-md-text.html" .text }}
{{ with .command }}
{{ partial "hub-md-code.html" . }}
{{ end }}{{ end }}
## Limitations
{{ range $l.limitations }}
{{ partial "hub-md-text.html" . }}
{{ end }}
## Not claimed
{{ range $l.not_claimed }}
{{ partial "hub-md-text.html" . }}
{{ end }}
## Evidence

{{ if .Params.hub.evidence_present }}{{ partial "hub-md-label.html" $l.evidence.date }}

{{ partial "hub-md-label.html" $l.evidence.pipelock_version }}

{{ partial "hub-md-text.html" $l.evidence.method }}{{ else }}Evidence not supplied.{{ end }}

{{ if .Params.hub.conformance -}}
{{ with .OutputFormats.Get "html" -}}
[Read the conformance results]({{ .Permalink }}conformance.json)
{{ end -}}
{{ end }}

{{ with partial "hub-rule-pages.html" . }}
## Rules in this bundle
{{ range . }}
- [{{ partial "hub-md-label.html" .Title }}]({{ (.OutputFormats.Get "markdown").Permalink }})
{{- end }}
{{ end }}

{{ with .Params.hub.license_material -}}
## License

[Download {{ .license.name }}]({{ absURL (strings.TrimPrefix "/" .license.route) }})

{{ partial "hub-md-code.html" (chomp .license.text) }}
{{ with .notices }}
## Notices
{{ range . }}
[Download {{ .name }}]({{ absURL (strings.TrimPrefix "/" .route) }})

{{ partial "hub-md-code.html" (chomp .text) }}
{{ end }}{{ end }}
{{ end -}}
## Disclosures

{{ if ne $.Params.hub.badge "first-party" }}AI assisted: {{ $l.disclosures.ai_assisted }}{{ end }}
{{ with $l.disclosures.ai_text }}
{{ partial "hub-md-text.html" . }}
{{ end }}
{{ partial "hub-md-text.html" $l.disclosures.conflict_of_interest }}

## External links

PipeLab doesn't review these external destinations.
{{ range $name, $url := $l.links }}
{{ partial "hub-md-label.html" $name }} ({{ partial "hub-md-label.html" (partial "hub-link-host.html" (dict "url" $url "name" $name "record" $.Params.hub)) }}): {{ partial "hub-md-text.html" $url }}
{{ end }}

{{ end }}
{{ if .Params.hub.config_assessment -}}
{{ with .OutputFormats.Get "html" -}}
[Download assessed configuration]({{ .Permalink }}pipelock.yaml)
{{ end }}

{{ end -}}
{{ partial "hub-facts.markdown" . }}
