Source: {{ .Permalink }}

# {{ partial "hub-md-label.html" .Title }}

{{ $l := .Params.hub.listing -}}
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

## Disclosures

AI assisted: {{ $l.disclosures.ai_assisted }}
{{ with $l.disclosures.ai_text }}
{{ partial "hub-md-text.html" . }}
{{ end }}
{{ partial "hub-md-text.html" $l.disclosures.conflict_of_interest }}

## External links

PipeLab doesn't review these external destinations.
{{ range $name, $url := $l.links }}
{{ partial "hub-md-label.html" $name }} ({{ partial "hub-md-label.html" (urls.Parse $url).Host }}): {{ partial "hub-md-text.html" $url }}
{{ end }}
