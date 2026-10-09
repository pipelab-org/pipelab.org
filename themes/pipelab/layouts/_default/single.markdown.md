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
{{- /* Legal/utility pages may have lastmod for sitemap freshness without a meaningful publish date. */ -}}
{{- if and (not .Date.IsZero) (not .Params.suppress_published) }}
Published: {{ .Date.Format "2006-01-02" }}
{{- end }}
{{- if and (isset .Params "lastmod") (or .Params.suppress_published (ne (.Lastmod.Format "2006-01-02") (.Date.Format "2006-01-02"))) }}
Updated: {{ .Lastmod.Format "2006-01-02" }}
{{- end }}

{{ partial "blog-updates.html" (dict "page" . "format" "markdown") }}
{{ .RenderShortcodes }}
{{- if and (eq .Section "compare") .Params.sources }}

## Sources checked

{{ range .Params.sources }}- [{{ .label }}]({{ .url }}){{ with .checked }} (checked {{ . }}){{ end }}
{{ end }}
Third-party product names and marks belong to their owners. PipeLab is not affiliated with, sponsored by, or endorsed by the makers of any product compared on this page. Descriptions of other products come from their own public materials on the dates listed above and reflect PipeLab's reading of them. Corrections: https://pipelab.org/contact/
{{- end }}
{{- with .Params.project_sections }}
{{ range . }}
## {{ .title }}

{{ range .columns }}{{ . | markdownify }}

{{ end }}{{ with .body }}{{ . | markdownify }}

{{ end }}{{ range .links }}- [{{ .label }}]({{ .href }})
{{ end }}
{{ end }}
{{- end }}
