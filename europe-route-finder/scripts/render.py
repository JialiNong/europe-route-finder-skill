#!/usr/bin/env python3
"""把行程 JSON 渲染成一个独立的 HTML 文件（样式和脚本都内联，离线也能打开）。

用法：python3 render.py <trip.json> [输出.html]
只用 Python 标准库，适合没有 Node 的环境（例如 ChatGPT 的代码解释器）。
"""
import html
import json
import sys
from pathlib import Path

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "template"


def validate(d):
    """只检查渲染必需的字段；完整格式见 schema/trip.schema.json。"""
    p = []
    if not isinstance(d, dict):
        return ["顶层必须是一个对象"]
    for k in ("title", "origin", "destination", "queriedAt"):
        if not isinstance(d.get(k), str) or not d.get(k):
            p.append(f"缺少字符串字段 {k}")
    routes = d.get("routes")
    if not isinstance(routes, list) or not routes:
        p.append("routes 必须是非空数组")
        return p
    n_dates = len(d.get("dates") or [])
    for i, r in enumerate(routes):
        rid = chr(65 + i)
        if not isinstance(r, dict):
            p.append(f"routes[{i}] 必须是对象")
            continue
        if not r.get("name"):
            p.append(f"方案 {rid} 缺少 name")
        if not r.get("total"):
            p.append(f"方案 {rid} 缺少 total")
        if r.get("effort") and r["effort"] not in ("green", "blue", "red"):
            p.append(f"方案 {rid} 的 effort 只能是 green / blue / red")
        if n_dates > 1 and r.get("datePrices") and len(r["datePrices"]) != n_dates:
            p.append(f"方案 {rid} 的 datePrices 有 {len(r['datePrices'])} 项，但 dates 有 {n_dates} 项")
        for j, leg in enumerate(r.get("legs") or []):
            if not leg.get("t"):
                p.append(f"方案 {rid} 的 legs[{j}] 缺少 t")
        for j, b in enumerate(r.get("buy") or []):
            if not b.get("item") or not b.get("price"):
                p.append(f"方案 {rid} 的 buy[{j}] 需要 item 和 price")
    return p


def main():
    if len(sys.argv) < 2:
        sys.exit("用法：python3 render.py <trip.json> [输出.html]")
    src = Path(sys.argv[1])
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"JSON 解析失败：{e}")
    problems = validate(data)
    if problems:
        sys.exit("JSON 不符合格式要求：\n- " + "\n- ".join(problems))

    shell = (TEMPLATE_DIR / "shell.html").read_text(encoding="utf-8")
    style = (TEMPLATE_DIR / "style.css").read_text(encoding="utf-8")
    script = (TEMPLATE_DIR / "render.js").read_text(encoding="utf-8")
    # 防止 JSON 里的 "</script" 提前结束 <script> 标签
    payload = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    title = data.get("title") or f"{data['origin']} → {data['destination']}"

    out = (
        shell.replace("{{TITLE}}", html.escape(title), 1)
        .replace("{{STYLE}}", style, 1)
        .replace("{{DATA}}", payload, 1)
        .replace("{{SCRIPT}}", script, 1)
    )
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".html")
    dst.write_text(out, encoding="utf-8")
    print(f"已生成 {dst}（{len(data['routes'])} 条方案，{len(out.encode('utf-8'))} 字节）")


if __name__ == "__main__":
    main()
