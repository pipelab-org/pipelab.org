#!/usr/bin/env python3
"""Render PipeLab identity assets from one source."""

from __future__ import annotations

import hashlib
import html
import json
import math
import random
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "assets/brand/brand-contract.json"
OUT = ROOT / "static/images/brand"
OG_OUT = ROOT / "static/images/og"


def load_contract() -> dict[str, object]:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def mark_content(*, color: str) -> str:
    return f'''<g stroke="{color}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
  <path d="M94 30v51L51 162c-9 17 4 37 23 37h92c19 0 32-20 23-37l-43-81V30"/>
  <path d="M85 30h70M68 151h104"/>
</g><circle cx="101" cy="129" r="8" fill="{color}"/><circle cx="139" cy="168" r="6" fill="{color}"/>'''


def mark_svg(size: int = 512, *, monochrome: str | None = None) -> str:
    token = load_contract()["tokens"]
    accent = monochrome or token["accent"]
    background = "" if monochrome else f'  <rect width="240" height="240" rx="52" fill="{token["background"]}"/>\n'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 240 240" fill="none">
{background}  {mark_content(color=accent)}
</svg>'''


def svg_body(svg: str) -> str:
    return svg.split(">", 1)[1].rsplit("</svg>", 1)[0]


def wordmark_text(x: int, y: int, size: int) -> str:
    token = load_contract()["tokens"]
    return (
        f'<text x="{x}" y="{y}" font-family="JetBrains Mono, monospace" '
        f'font-size="{size}" font-weight="700" fill="{token["text"]}">Pipe'
        f'<tspan fill="{token["accent"]}">Lab</tspan></text>'
    )


def horizontal_svg() -> str:
    token = load_contract()["tokens"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="560" height="150" viewBox="0 0 560 150" fill="none">
  <g id="identity" transform="translate(42)">
    <g transform="translate(16 15) scale(.5)">{mark_content(color=token["accent"])}</g>
    {wordmark_text(168, 88, 66)}
    <text x="171" y="121" font-family="Inter, sans-serif" font-size="16" letter-spacing="4" fill="{token["muted"]}">AGENT SECURITY</text>
  </g>
</svg>'''


def dark_panel_lockup_svg() -> str:
    """Opaque 300x150 lockup for partner slots on any host background."""
    token = load_contract()["tokens"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150" fill="none">
  <rect width="300" height="150" fill="{token["background"]}"/>
  <g transform="translate(4 36) scale(.52)">{svg_body(horizontal_svg()).strip()}</g>
</svg>'''


def stacked_svg() -> str:
    token = load_contract()["tokens"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="420" height="340" viewBox="0 0 420 340" fill="none">
  <g id="identity">
    <g transform="translate(90 0)">{mark_content(color=token["accent"])}</g>
    <text x="210" y="282" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="60" font-weight="700"><tspan fill="{token["text"]}">Pipe</tspan><tspan fill="{token["accent"]}">Lab</tspan></text>
    <text x="210" y="319" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" letter-spacing="4" fill="{token["muted"]}">AGENT SECURITY</text>
  </g>
</svg>'''


def particles() -> str:
    token = load_contract()["tokens"]
    rng = random.Random(340)
    points: list[tuple[int, int]] = []
    while len(points) < 42:
        point = (rng.randint(70, 1210), rng.randint(55, 565))
        if not (420 <= point[0] <= 1060 and 190 <= point[1] <= 460):
            points.append(point)
    output = [f'<g stroke="{token["accent"]}" stroke-width="1">']
    for index, (x1, y1) in enumerate(points):
        for x2, y2 in points[index + 1 :]:
            distance = math.hypot(x2 - x1, y2 - y1)
            if distance < 150:
                opacity = round(0.16 * (1 - distance / 150), 3)
                output.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" opacity="{opacity}"/>')
    output.append('</g>')
    output.append(f'<g fill="{token["accent"]}" opacity=".5">')
    output.extend(f'<circle cx="{x}" cy="{y}" r="1.6"/>' for x, y in points)
    output.append('</g>')
    return "".join(output)


def social_svg() -> str:
    token = load_contract()["tokens"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" fill="none">
  <defs>
    <radialGradient id="teal" cx="28%" cy="22%" r="58%"><stop offset="0" stop-color="{token["accent"]}" stop-opacity=".22"/><stop offset="1" stop-color="{token["accent"]}" stop-opacity="0"/></radialGradient>
    <radialGradient id="purple" cx="76%" cy="84%" r="58%"><stop offset="0" stop-color="{token["purple"]}" stop-opacity=".30"/><stop offset="1" stop-color="{token["purple"]}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1280" height="640" fill="{token["background"]}"/><rect width="1280" height="640" fill="url(#teal)"/><rect width="1280" height="640" fill="url(#purple)"/>
  {particles()}
  <g id="identity" transform="translate(74)">
    <g transform="translate(104 172) scale(1.18)">{mark_content(color=token["accent"])}</g>
    {wordmark_text(452, 287, 92)}
    <text x="456" y="342" font-family="Inter, sans-serif" font-size="25" fill="{token["muted"]}">Open agent-security projects and research</text>
    <g font-family="JetBrains Mono, monospace" font-size="17" font-weight="600" text-anchor="middle">
      <rect x="456" y="398" width="132" height="46" rx="23" fill="{token["accent"]}" fill-opacity=".08" stroke="{token["accent"]}" stroke-opacity=".42"/><text x="522" y="428" fill="{token["accent"]}">Pipelock</text>
      <rect x="606" y="398" width="126" height="46" rx="23" fill="{token["accent"]}" fill-opacity=".08" stroke="{token["accent"]}" stroke-opacity=".42"/><text x="669" y="428" fill="{token["accent"]}">Rules</text>
      <rect x="750" y="398" width="118" height="46" rx="23" fill="{token["accent"]}" fill-opacity=".08" stroke="{token["accent"]}" stroke-opacity=".42"/><text x="809" y="428" fill="{token["accent"]}">Bench</text>
      <rect x="886" y="398" width="94" height="46" rx="23" fill="{token["accent"]}" fill-opacity=".08" stroke="{token["accent"]}" stroke-opacity=".42"/><text x="933" y="428" fill="{token["accent"]}">AEL</text>
    </g>
  </g>
  <text x="120" y="566" font-family="JetBrains Mono, monospace" font-size="16" fill="{token["dim"]}" letter-spacing=".12em">pipelab.org</text>
</svg>'''


def constellation_svg() -> str:
    """Render the exact social-card field without the card's foreground lockup."""
    token = load_contract()["tokens"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" fill="none">
  <defs>
    <radialGradient id="teal" cx="28%" cy="22%" r="58%"><stop offset="0" stop-color="{token["accent"]}" stop-opacity=".22"/><stop offset="1" stop-color="{token["accent"]}" stop-opacity="0"/></radialGradient>
    <radialGradient id="purple" cx="76%" cy="84%" r="58%"><stop offset="0" stop-color="{token["purple"]}" stop-opacity=".30"/><stop offset="1" stop-color="{token["purple"]}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1280" height="640" fill="{token["background"]}"/><rect width="1280" height="640" fill="url(#teal)"/><rect width="1280" height="640" fill="url(#purple)"/>
  {particles()}
</svg>'''


def particle_field_svg() -> str:
    """Render the canonical constellation marks on a transparent canvas."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" fill="none">
  {particles()}
</svg>'''


# Site-owned social cards. Imported project artifacts stay outside this table.
# Each row names the page(s) that own the message, then supplies only copy and a
# small presentation variant. Shared rendering below owns every coordinate.
SITE_CARDS = {
    "og-homepage": {
        "sources": ("content/_index.md",),
        "eyebrow": "PIPELAB",
        "headline": ("Runtime security and evidence", "for AI agents"),
        "lead": ("Pipelock protects mediated egress and MCP traffic.", "Signed evidence supports security and compliance."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-product": {
        "sources": ("content/pipelock.md", "content/buildhop.md"),
        "eyebrow": "PIPELOCK",
        "headline": ("Open-source", "Agent Firewall"),
        "lead": ("Blocks secret leaks and SSRF. Detects prompt injection.", "Signs action receipts you can verify offline."),
        "badges": (("label", "DLP FIRST", "BEFORE DNS"), ("stat", "dlp_patterns", "DLP PATTERNS"), ("label", "GO", "SINGLE BINARY")),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-pricing": {
        "sources": ("content/pricing.md",),
        "eyebrow": "PIPELOCK PRICING",
        "headline": ("Free firewall.", "Paid coordination."),
        "lead": ("Full scanning stays free. Add paid features when your", "agent fleet needs coordination, assessment, or governance."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0 · enterprise/: ELv2",
    },
    "og-enterprise": {
        "sources": ("content/enterprise.md",),
        "eyebrow": "PIPELOCK ENTERPRISE",
        "headline": ("Govern your agent fleet", "from one place"),
        "lead": ("One policy everywhere. Signed records of mediated actions.", "A multi-person emergency stop."),
        "badges": (),
        "footer": "PipeLab · Pipelock Enterprise: ELv2",
    },
    "og-playground": {
        "sources": ("content/playground-challenge.md", "content/make-it-leak/002.md", "content/make-it-leak/003.md", "content/make-it-leak/004.md"),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Try to make the agent", "leak its secret"),
        "lead": ("Inspect the signed decision for each mediated action.", "A claim only counts when the evidence proves it."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-playground-v2": {
        "sources": ("content/playground/_index.md", "content/playground/replay/_index.md", "content/make-it-leak/_index.md"),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Replay Audit Packet Gallery",),
        "lead": ("Recorded agent actions, mediated decisions, and signed", "Audit Packets you can verify offline."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-learn": {
        "sources": ("content/learn/_index.md", "content/learn/ai-agent-security-categories.md"),
        "eyebrow": "LEARN",
        "headline": ("AI agent security", "guides and standards"),
        "lead": ("Practical guides for MCP defense, evidence verification,", "compliance, and secure agent setup."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-compare": {
        "sources": ("content/compare/_index.md", "themes/pipelab/layouts/_default/baseof.html"),
        "eyebrow": "COMPARE",
        "headline": ("AI agent security tools", "and firewalls compared"),
        "lead": ("See where Pipelock fits against gateways, guardrails,", "scanners, and other agent-security categories."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-blog": {
        "sources": ("content/blog/_index.md", "themes/pipelab/layouts/_default/baseof.html"),
        "eyebrow": "BLOG",
        "headline": ("AI agent security", "research and field notes"),
        "lead": ("Attack breakdowns, CVE analysis, runtime defense,", "and lessons from Pipelock deployments."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-assess": {
        "sources": ("content/assess.md",),
        "eyebrow": "PIPELOCK ASSESS",
        "headline": ("AI security", "assessment reports"),
        "lead": ("Findings, remediation, and framework mappings.", "Signed by default."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0 · enterprise/: ELv2",
    },
    "og-agent-firewall": {
        "sources": ("content/agent-firewall.md",),
        "eyebrow": "AGENT FIREWALL GUIDE",
        "headline": ("What is an", "agent firewall?"),
        "lead": ("It inspects AI-agent HTTP, WebSocket, and MCP traffic", "to block leaks, injection, and tool poisoning."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "og-about": {
        "sources": ("content/about.md",),
        "eyebrow": "ABOUT PIPELAB",
        "headline": ("Built by", "practitioners"),
        "lead": ("PipeLab builds Pipelock, an open-source agent firewall", "for MCP and agent traffic."),
        "badges": (),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "playground-allowed-safe-read": {
        "sources": ("content/playground/replay/allowed-safe-read.md",),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Allowed Safe Read",),
        "lead": ("A harmless lab read passes through Pipelock and", "still produces a signed allow receipt."),
        "badges": (("label", "ALLOW", "SIGNED AUDIT PACKET"),),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "playground-operation-aware-policy": {
        "sources": ("content/playground/replay/operation-aware-policy.md",),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Operation-Aware Policy",),
        "lead": ("A safe GraphQL read is allowed. A destructive mutation", "is denied by request policy."),
        "badges": (("label", "BLOCK", "SIGNED AUDIT PACKET"),),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "playground-prompt-injection-response-blocked": {
        "sources": ("content/playground/replay/prompt-injection-response-blocked.md",),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Prompt Injection", "Response Blocked"),
        "lead": ("A hostile instruction hidden in fetched content is", "blocked on the response path."),
        "badges": (("label", "BLOCK", "SIGNED AUDIT PACKET"),),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "playground-secret-exfil-url-blocked": {
        "sources": ("content/playground/replay/secret-exfil-url-blocked.md",),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("Secret Exfiltration", "Blocked"),
        "lead": ("A synthetic key in a URL is stopped before the", "request leaves the lab."),
        "badges": (("label", "BLOCK", "SIGNED AUDIT PACKET"),),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
    "playground-ssrf-internal-target-blocked": {
        "sources": ("content/playground/replay/ssrf-internal-target-blocked.md",),
        "eyebrow": "PIPELOCK PLAYGROUND",
        "headline": ("SSRF Metadata Target", "Blocked"),
        "lead": ("A reach for the cloud metadata endpoint is blocked", "by the SSRF layer."),
        "badges": (("label", "BLOCK", "SIGNED AUDIT PACKET"),),
        "footer": "PipeLab · Pipelock core: Apache 2.0",
    },
}


def load_stats() -> dict[str, str]:
    """Read the scalar public stats used by card rows without adding a YAML dependency."""
    stats: dict[str, str] = {}
    for line in (ROOT / "data/stats.yaml").read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([a-z_]+):\s*(?:\"([^\"]*)\"|([^#\s][^#]*?))\s*(?:#.*)?$", line)
        if match:
            stats[match.group(1)] = (match.group(2) or match.group(3)).strip()
    return stats


def card_text(value: str) -> str:
    return html.escape(value, quote=False)


def centered_text(value: str, y: int, size: int, color: str, *, family: str, weight: int, letter_spacing: str = "0") -> str:
    return (
        f'<text x="640" y="{y}" text-anchor="middle" font-family="{family}" '
        f'font-size="{size}" font-weight="{weight}" letter-spacing="{letter_spacing}" fill="{color}">{card_text(value)}</text>'
    )


def card_badges(card: dict[str, object], stats: dict[str, str], token: dict[str, str]) -> str:
    badges = card["badges"]
    if not badges:
        return ""
    rows: list[str] = []
    column_width = 220
    start = 640 - (len(badges) - 1) * column_width / 2
    for index, (kind, value, label) in enumerate(badges):
        x = start + index * column_width
        if kind == "stat":
            if value not in stats:
                raise RuntimeError(f"missing required stat {value!r} in data/stats.yaml")
            display = stats[value]
        else:
            display = value
        rows.append(centered_text(display, 484, 27, token["accent"], family="JetBrains Mono, monospace", weight=700).replace('x="640"', f'x="{x:g}"'))
        rows.append(centered_text(label, 513, 13, token["dim"], family="Inter, sans-serif", weight=600, letter_spacing="2.4").replace('x="640"', f'x="{x:g}"'))
    return "\n    ".join(rows)


def site_card_svg(card: dict[str, object], stats: dict[str, str]) -> str:
    token = load_contract()["tokens"]
    headline = card["headline"]
    headline_y = (280,) if len(headline) == 1 else (254, 318)
    headline_lines = "\n    ".join(
        centered_text(line, y, 52, token["accent"] if index else token["text"], family="JetBrains Mono, monospace", weight=700)
        for index, (line, y) in enumerate(zip(headline, headline_y, strict=True))
    )
    lead_y = (376, 406) if len(headline) == 1 else (380, 410)
    lead_lines = "\n    ".join(
        centered_text(line, y, 20, token["muted"], family="Inter, sans-serif", weight=450)
        for line, y in zip(card["lead"], lead_y, strict=True)
    )
    badges = card_badges(card, stats, token)
    badge_lines = f"    {badges}\n" if badges else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" fill="none">
  {svg_body(constellation_svg()).strip()}
  <g id="identity" transform="translate(0 3)">
    <g transform="translate(474 47) scale(.27)">{mark_content(color=token["accent"])}</g>
    {wordmark_text(555, 101, 48)}
    {centered_text(card["eyebrow"], 177, 15, token["accent"], family="JetBrains Mono, monospace", weight=700, letter_spacing="3")}
    {headline_lines}
    {lead_lines}
{badge_lines}    {centered_text(card["footer"], 550, 15, token["dim"], family="JetBrains Mono, monospace", weight=600)}
    <line x1="160" y1="580" x2="1120" y2="580" stroke="{token["accent"]}" stroke-width="3"/>
  </g>
</svg>'''


def render_site_card_vectors() -> None:
    """Write every site card SVG. Needs no rasterizer, so the drift check can
    still catch generator-versus-committed-source drift on a bare runner."""
    stats = load_stats()
    for card_id, card in SITE_CARDS.items():
        write_text(OG_OUT / f"{card_id}.svg", site_card_svg(card, stats))


def render_site_cards() -> None:
    render_site_card_vectors()
    for card_id in SITE_CARDS:
        export_png(OG_OUT / f"{card_id}.svg", OG_OUT / f"{card_id}.png", 1280)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def export_png(svg: Path, png: Path, width: int) -> None:
    inkscape = shutil.which("inkscape")
    if not inkscape:
        raise RuntimeError("inkscape is required to render brand rasters")
    subprocess.run(
        [inkscape, str(svg), f"--export-filename={png}", f"--export-width={width}"],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    source = hashlib.sha256(svg.read_bytes()).hexdigest()
    raster = hashlib.sha256(png.read_bytes()).hexdigest()
    write_text(png.with_suffix(png.suffix + ".source"), f"source_sha256={source}\nraster_sha256={raster}")


def write_provenance(source: Path, output: Path) -> None:
    write_text(
        output.with_suffix(output.suffix + ".source"),
        f"source_sha256={hashlib.sha256(source.read_bytes()).hexdigest()}\n"
        f"raster_sha256={hashlib.sha256(output.read_bytes()).hexdigest()}",
    )


def render_vectors() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "pipelab-mark.svg": mark_svg(),
        "pipelab-mark-mono-light.svg": mark_svg(monochrome="#ffffff"),
        "pipelab-mark-mono-dark.svg": mark_svg(monochrome="#09090b"),
        "pipelab-lockup.svg": horizontal_svg(),
        "pipelab-lockup-dark-panel.svg": dark_panel_lockup_svg(),
        "pipelab-lockup-stacked.svg": stacked_svg(),
        "pipelab-constellation.svg": constellation_svg(),
        "pipelab-particle-field.svg": particle_field_svg(),
        "pipelab-social-preview.svg": social_svg(),
    }
    for name, content in outputs.items():
        write_text(OUT / name, content)
    write_text(ROOT / "static/favicon.svg", mark_svg(size=64))
    render_site_card_vectors()


def render() -> None:
    render_vectors()
    export_png(OUT / "pipelab-lockup-dark-panel.svg", OUT / "pipelab-lockup-dark-panel.png", 300)
    render_site_cards()  # rasterizes the vectors written above
    export_png(OUT / "pipelab-social-preview.svg", OUT / "pipelab-social-preview.png", 1280)
    shutil.copyfile(OUT / "pipelab-social-preview.png", ROOT / "static/og-image.png")
    write_provenance(OUT / "pipelab-social-preview.svg", ROOT / "static/og-image.png")
    export_png(ROOT / "static/favicon.svg", ROOT / "static/favicon-48x48.png", 48)
    export_png(ROOT / "static/favicon.svg", ROOT / "static/favicon-96x96.png", 96)
    export_png(ROOT / "static/favicon.svg", ROOT / "static/favicon-192x192.png", 192)
    export_png(ROOT / "static/favicon.svg", ROOT / "static/favicon-512x512.png", 512)
    export_png(ROOT / "static/favicon.svg", ROOT / "static/apple-touch-icon.png", 180)
    # ImageMagick is only ever needed for the .ico container, and it ships under
    # two different entrypoint names: `magick` in version 7, `convert` in
    # version 6. Both take these arguments identically. Accepting either matters
    # because a maintainer on ImageMagick 6 who changes the favicon would
    # otherwise be unable to rebuild the .ico, and would then hit a provenance
    # mismatch on an artifact they had no way to regenerate.
    ico_tool = shutil.which("magick") or shutil.which("convert")
    if ico_tool:
        subprocess.run(
            [ico_tool, str(ROOT / "static/favicon-48x48.png"), "-define", "icon:auto-resize=48,32,16", str(ROOT / "static/favicon.ico")],
            check=True,
        )
        write_provenance(ROOT / "static/favicon.svg", ROOT / "static/favicon.ico")


def provenance_problem(source: Path, output: Path) -> str | None:
    sidecar = output.with_suffix(output.suffix + ".source")
    if not source.is_file() or not output.is_file() or not sidecar.is_file():
        return f"missing source, raster, or provenance sidecar for {output.relative_to(ROOT)}"
    recorded = dict(
        line.split("=", 1)
        for line in sidecar.read_text(encoding="utf-8").splitlines()
        if "=" in line
    )
    expected_source = hashlib.sha256(source.read_bytes()).hexdigest()
    expected_raster = hashlib.sha256(output.read_bytes()).hexdigest()
    if recorded.get("source_sha256") != expected_source:
        return f"{output.relative_to(ROOT)} was rendered from a different source"
    if recorded.get("raster_sha256") != expected_raster:
        return f"{output.relative_to(ROOT)} does not match its provenance sidecar"
    return None


def png_size_problem(path: Path, width: int, height: int) -> str | None:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", data[16:24]) != (width, height):
        return f"{path.relative_to(ROOT)} must be {width}x{height} PNG"
    return None


def expected_paths() -> list[Path]:
    names = [
        "pipelab-mark.svg", "pipelab-mark-mono-light.svg", "pipelab-mark-mono-dark.svg",
        "pipelab-lockup.svg", "pipelab-lockup-stacked.svg", "pipelab-constellation.svg",
        "pipelab-lockup-dark-panel.svg", "pipelab-lockup-dark-panel.png", "pipelab-lockup-dark-panel.png.source",
        "pipelab-particle-field.svg",
        "pipelab-social-preview.svg",
        "pipelab-social-preview.png", "pipelab-social-preview.png.source",
    ]
    brand_paths = [OUT / name for name in names] + [
        ROOT / "static/favicon.svg", ROOT / "static/favicon-48x48.png",
        ROOT / "static/favicon-48x48.png.source", ROOT / "static/favicon-96x96.png",
        ROOT / "static/favicon-96x96.png.source", ROOT / "static/favicon-192x192.png",
        ROOT / "static/favicon-192x192.png.source", ROOT / "static/favicon-512x512.png",
        ROOT / "static/favicon-512x512.png.source", ROOT / "static/apple-touch-icon.png",
        ROOT / "static/apple-touch-icon.png.source", ROOT / "static/favicon.ico",
        ROOT / "static/favicon.ico.source", ROOT / "static/og-image.png", ROOT / "static/og-image.png.source",
    ]
    card_paths = [
        path
        for card_id in SITE_CARDS
        for path in (
            OG_OUT / f"{card_id}.svg",
            OG_OUT / f"{card_id}.png",
            OG_OUT / f"{card_id}.png.source",
        )
    ]
    return brand_paths + card_paths


def site_card_provenance_pairs() -> list[tuple[Path, Path]]:
    return [
        (OG_OUT / f"{card_id}.svg", OG_OUT / f"{card_id}.png")
        for card_id in SITE_CARDS
    ]


def centering_problem(path: Path, width: float, height: float) -> str | None:
    inkscape = shutil.which("inkscape")
    if not inkscape:
        return "inkscape is required to verify visible-ink centering"
    result = subprocess.run(
        [
            inkscape, str(path), "--query-id=identity", "--query-x", "--query-y",
            "--query-width", "--query-height",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    x, y, ink_width, ink_height = (float(value) for value in result.stdout.splitlines())
    dx = abs((x + ink_width / 2) - width / 2)
    dy = abs((y + ink_height / 2) - height / 2)
    if dx > 1.5 or dy > 1.5:
        return f"visible ink is off center by {dx:.2f}px horizontally and {dy:.2f}px vertically"
    return None


def check(require_renderer: bool = False) -> int:
    paths = expected_paths()
    before = {path: path.read_bytes() for path in paths if path.exists()}
    # Raster bytes differ across inkscape builds and font stacks, so only an
    # explicit --require-renderer run re-renders and byte-compares them. A
    # plain --check matches CI on any machine: vectors are regenerated and
    # every raster is held to its provenance sidecar. Optical centering is
    # measured from the vectors, so it still runs whenever inkscape is present.
    has_renderer = bool(shutil.which("inkscape"))
    full_render = require_renderer and has_renderer
    if require_renderer and not full_render:
        # CI asks for the complete gate. Degrading silently here would let a
        # centering regression and a stale raster pass as "current".
        print(
            "inkscape is required for the full asset check; install it or drop "
            "--require-renderer",
            file=sys.stderr,
        )
        return 1
    try:
        if full_render:
            render()
        else:
            render_vectors()
        changed = [str(path.relative_to(ROOT)) for path in paths if before.get(path) != path.read_bytes()]
        geometry = []
        if has_renderer:
            for filename, width, height in (
                ("pipelab-lockup.svg", 560, 150),
                ("pipelab-lockup-stacked.svg", 420, 340),
                ("pipelab-social-preview.svg", 1280, 640),
                ("pipelab-lockup-dark-panel.svg", 300, 150),
            ):
                problem = centering_problem(OUT / filename, width, height)
                if problem:
                    geometry.append(f"static/images/brand/{filename}: {problem}")
            for card_id in SITE_CARDS:
                path = OG_OUT / f"{card_id}.svg"
                problem = centering_problem(path, 1280, 640)
                if problem:
                    geometry.append(f"static/images/og/{card_id}.svg: {problem}")
        provenance = []
        for source, output in (
            (OUT / "pipelab-lockup-dark-panel.svg", OUT / "pipelab-lockup-dark-panel.png"),
            (OUT / "pipelab-social-preview.svg", OUT / "pipelab-social-preview.png"),
            (OUT / "pipelab-social-preview.svg", ROOT / "static/og-image.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/favicon-48x48.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/favicon-96x96.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/favicon-192x192.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/favicon-512x512.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/apple-touch-icon.png"),
            (ROOT / "static/favicon.svg", ROOT / "static/favicon.ico"),  # hash-checked even without ImageMagick
            *site_card_provenance_pairs(),
        ):
            problem = provenance_problem(source, output)
            if problem:
                provenance.append(problem)
        panel_png = OUT / "pipelab-lockup-dark-panel.png"
        if panel_png.is_file():
            problem = png_size_problem(panel_png, 300, 150)
            if problem:
                provenance.append(problem)
    finally:
        for path in paths:
            if path in before:
                path.write_bytes(before[path])
            elif path.exists():
                path.unlink()
    if changed or geometry or provenance:
        if changed:
            print("stale PipeLab brand assets: " + ", ".join(changed), file=sys.stderr)
        for problem in geometry:
            print(problem, file=sys.stderr)
        for problem in provenance:
            print(problem, file=sys.stderr)
        return 1
    if full_render:
        suffix = ""
    elif has_renderer:
        suffix = " (centering and raster provenance verified; run --check --require-renderer to re-render rasters)"
    else:
        suffix = " (raster provenance verified; renderer unavailable)"
    print("PipeLab brand assets are current" + suffix)
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        raise SystemExit(check(require_renderer="--require-renderer" in sys.argv[2:]))
    render()
