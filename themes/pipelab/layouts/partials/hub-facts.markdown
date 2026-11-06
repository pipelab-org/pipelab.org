{{- $blocks := slice -}}
{{- $facts := .Params.hub.display_facts | default slice -}}
{{- if eq .Kind "section" -}}
  {{- $route := .RelPermalink -}}{{- with .OutputFormats.Get "html" -}}{{- $route = .RelPermalink -}}{{- end -}}
  {{- with site.Data.hub.generated.sections -}}{{- range $key, $value := index . $route -}}{{- $facts = $facts | append (dict "key" $key "value" $value) -}}{{- end -}}{{- end -}}
{{- end -}}
{{- range $facts -}}
  {{- $blocks = $blocks | append (partial "hub-md-code.html" (dict "hub_fact" .key "value" .value | jsonify)) -}}
{{- end -}}
{{- return (delimit $blocks "\n\n") -}}
