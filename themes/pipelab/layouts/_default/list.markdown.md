{{- $html := .OutputFormats.Get "html" -}}
# {{ .Title }}

{{- with $html }}
Canonical URL: {{ .Permalink }}
{{- end }}
{{- with .Description }}
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
- [{{ .Title }}]({{ if $pageHTML }}{{ $pageHTML.Permalink }}{{ else }}{{ .Permalink }}{{ end }}){{ with .Description }}: {{ . }}{{ end }}
{{ end }}
{{ end }}
