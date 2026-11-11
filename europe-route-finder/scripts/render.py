#!/usr/bin/env python3
"""Render a trip JSON file into one standalone HTML page (styles and script inlined, works offline).
把行程 JSON 渲染成一个独立的 HTML 文件（样式和脚本都内联，离线也能打开）。

Usage / 用法: python3 render.py <trip.json> [output.html]
Standard library only, so it also runs in sandboxes without Node (e.g. ChatGPT's code interpreter).
"""
import html
import json
import re
import sys
from pathlib import Path

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "template"


def is_loc(v):
    return isinstance(v, dict) and len(v) > 0 and all(k in ("zh", "en") for k in v)


def is_text(v):
    """A text field is a non-empty string or a localized object such as {"zh": "…", "en": "…"}."""
    return (isinstance(v, str) and v != "") or (is_loc(v) and any(isinstance(x, str) and x for x in v.values()))


def text(v, lang=None):
    if isinstance(v, str):
        return v
    if is_loc(v):
        return v.get("en" if lang == "en" else "zh") or v.get("zh") or v.get("en") or ""
    return ""


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate(d):
    """Only checks what rendering needs; see schema/trip.schema.json for the full format."""
    p = []
    if not isinstance(d, dict):
        return ["the top level must be an object"]
    for k in ("title", "origin", "destination", "queriedAt"):
        if not is_text(d.get(k)):
            p.append(f'missing text field "{k}"')
    if d.get("lang") is not None and d["lang"] not in ("zh", "en"):
        p.append('"lang" must be "zh" or "en"')
    langs = d.get("languages")
    if langs is not None and (not isinstance(langs, list) or any(x not in ("zh", "en") for x in langs)):
        p.append('"languages" must be an array of "zh" / "en"')
    routes = d.get("routes")
    if not isinstance(routes, list) or not routes:
        p.append('"routes" must be a non-empty array')
        return p
    n_dates = len(d.get("dates") or [])
    for i, r in enumerate(routes):
        rid = f"route {chr(65 + i)}"
        if not isinstance(r, dict):
            p.append(f"routes[{i}] must be an object")
            continue
        if not is_text(r.get("name")):
            p.append(f"{rid}: missing name")
        if not is_text(r.get("total")):
            p.append(f"{rid}: missing total")
        if r.get("effort") and r["effort"] not in ("green", "blue", "red"):
            p.append(f"{rid}: effort must be green / blue / red")
        if n_dates > 1 and r.get("datePrices") and len(r["datePrices"]) != n_dates:
            p.append(f"{rid}: datePrices has {len(r['datePrices'])} items but dates has {n_dates}")
        for j, leg in enumerate(r.get("legs") or []):
            if not is_text(leg.get("t")):
                p.append(f"{rid}: legs[{j}] is missing t")
        for j, b in enumerate(r.get("buy") or []):
            if not is_text(b.get("item")) or not is_text(b.get("price")):
                p.append(f"{rid}: buy[{j}] needs item and price")
    return p


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 render.py <trip.json> [output.html]")
    src = Path(sys.argv[1])
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"Could not parse JSON: {e}")
    problems = validate(data)
    if problems:
        sys.exit("The JSON does not match the expected format:\n- " + "\n- ".join(problems))

    shell = (TEMPLATE_DIR / "shell.html").read_text(encoding="utf-8")
    style = (TEMPLATE_DIR / "style.css").read_text(encoding="utf-8")
    script = (TEMPLATE_DIR / "render.js").read_text(encoding="utf-8")
    # Escape "</" so text inside the JSON can never close the <script> tag early.
    payload = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    lang = data.get("lang")
    title = text(data.get("title"), lang) or f"{text(data.get('origin'), lang)} → {text(data.get('destination'), lang)}"
    parts = {"TITLE": html.escape(title), "STYLE": style, "DATA": payload, "SCRIPT": script}
    # One pass over the shell, so placeholder-like text inside the data is never replaced.
    out = re.sub(r"\{\{(TITLE|STYLE|DATA|SCRIPT)\}\}", lambda m: parts[m.group(1)], shell)
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".html")
    dst.write_text(out, encoding="utf-8")
    print(f"Wrote {dst} ({len(data['routes'])} routes, {len(out.encode('utf-8'))} bytes)")


if __name__ == "__main__":
    main()
