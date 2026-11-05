{{- $html := .OutputFormats.Get "html" -}}
# {{ .Title }}

{{- with $html }}
Canonical URL: {{ .Permalink }}
{{- end }}
{{- with (partial "fact-text.html" .Description) }}
Description: {{ . }}
{{- end }}
{{- with .Params.subtitle }}
Subtitle: {{ . }}
{{- end }}

## Overview

{{ .RenderShortcodes }}

{{ if .Pages }}
## Pages

{{ range .Pages }}
{{ $pageHTML := .OutputFormats.Get "html" -}}
- [{{ .Title }}]({{ if $pageHTML }}{{ $pageHTML.Permalink }}{{ else }}{{ .Permalink }}{{ end }}){{ with (partial "fact-text.html" .Description) }}: {{ . }}{{ end }}
{{ end }}
{{ end }}
