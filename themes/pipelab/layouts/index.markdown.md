{{- $html := .OutputFormats.Get "html" -}}
# PipeLab

{{- with $html }}
Canonical URL: {{ .Permalink }}
{{- end }}
Description: {{ .Site.Params.description }}

## Overview

PipeLab is the website and company behind Pipelock.
Pipelock is an open-source agent firewall for MCP and AI agent egress.
Pipelock mediates MCP, HTTP, and WebSocket traffic and can emit signed evidence for mediated actions when receipt or flight-recorder signing is configured.

Public methodology. Public attack cases. Public Pipelock results.

## Primary pages

{{- range .Site.Menus.main }}
- [{{ .Name }}]({{ printf "%s%s" $.Site.BaseURL (replace .URL "/" "" 1) }})
{{- end }}

## Key references

- [Agent Firewall]({{ .Site.BaseURL }}agent-firewall/)
- [MCP Security]({{ .Site.BaseURL }}learn/mcp-security/)
- [MCP Proxy]({{ .Site.BaseURL }}learn/mcp-proxy/)
- [Agent Egress Security]({{ .Site.BaseURL }}learn/agent-egress-security/)
- [MCP Tool Poisoning]({{ .Site.BaseURL }}learn/mcp-tool-poisoning/)
