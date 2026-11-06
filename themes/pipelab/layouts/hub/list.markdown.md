Source: {{ .Permalink }}

# {{ partial "hub-md-label.html" .Title }}

{{ range .RegularPagesRecursive.ByTitle }}{{ if .Params.hub.listing }}
{{ partial "hub-md-label.html" .Title }}

{{ .Permalink }}

{{ partial "hub-md-text.html" .Params.hub.listing.summary }}
{{ end }}

{{ end }}
{{ partial "hub-facts.markdown" . }}
