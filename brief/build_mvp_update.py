#!/usr/bin/env python3
"""Render the canonical MVP_UPDATE.md into print HTML (stdlib only).
Then print with agent-browser/Chrome; this script does not submit anything.
"""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/shahrryyar/zaincash-billpay-agent/blob/main/'


def inline(text):
    text = html.escape(text)
    def link(m):
        target = m.group(2)
        url = target if target.startswith('https://') else REPO + target
        return '<a href="' + url + '">' + m.group(1) + '</a>'
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', text)


def render(source):
    parts = []
    for block in source.strip().split('\n\n'):
        if block.startswith('# '):
            parts.append('<h1>' + inline(block[2:]) + '</h1>')
        elif block.startswith('## '):
            parts.append('<h2>' + inline(block[3:]) + '</h2>')
        elif block.startswith('|'):
            rows = []
            for i, line in enumerate(block.splitlines()):
                if re.fullmatch(r'[| :\-]+', line):
                    continue
                tag = 'th' if i == 0 else 'td'
                rows.append('<tr>' + ''.join('<' + tag + '>' + inline(c.strip()) + '</' + tag + '>' for c in line.strip('|').split('|')) + '</tr>')
            parts.append('<table>' + ''.join(rows) + '</table>')
        else:
            parts.append('<p>' + inline(' '.join(block.splitlines())) + '</p>')
    return '''<!doctype html><html lang="en"><meta charset="utf-8">
<title>Topic 04 — MVP update draft</title><style>
@page {size:A4; margin:13mm 16mm}
* {box-sizing:border-box}
body {font:10pt/1.35 Arial,sans-serif; color:#192e2a; margin:0; background:white}
h1 {font-size:19pt; line-height:1.12; margin:0 0 7pt; color:#006649; letter-spacing:-.4pt}
h2 {font-size:11.5pt; margin:11pt 0 3pt; color:#006649; break-after:avoid}
p {margin:0 0 7pt; orphans:3; widows:3}
table {border-collapse:collapse; width:100%; font-size:9.5pt; margin:7pt 0; break-inside:avoid}
th,td {padding:5pt 7pt; text-align:left; vertical-align:top; border-bottom:1px solid #c8d8d2}
th {background:#e8f3ed; color:#004e39}
td:first-child {width:55%}
a {color:#006649; text-decoration:none}
code {font-size:.95em}
</style><body>''' + '\n'.join(parts) + '</body></html>'


if __name__ == '__main__':
    out = ROOT / '.cache/readiness/mvp-update-print.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render((ROOT / 'MVP_UPDATE.md').read_text()))
    print(out)
