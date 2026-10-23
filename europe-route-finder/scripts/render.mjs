#!/usr/bin/env node
// 把行程 JSON 渲染成一个独立的 HTML 文件（样式和脚本都内联，离线也能打开）。
// 用法：node render.mjs <trip.json> [输出.html]
// 不需要安装任何依赖，Node 18+ 即可。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(here, "..", "template");

const [, , input, outputArg] = process.argv;
if (!input) {
  console.error("用法：node render.mjs <trip.json> [输出.html]");
  process.exit(1);
}

const raw = await readFile(input, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`JSON 解析失败：${e.message}`);
  process.exit(1);
}

const problems = validate(data);
if (problems.length) {
  console.error("JSON 不符合格式要求：\n- " + problems.join("\n- "));
  process.exit(1);
}

const [shell, style, script] = await Promise.all(
  ["shell.html", "style.css", "render.js"].map((f) => readFile(path.join(templateDir, f), "utf8"))
);

// 防止 JSON 里的 "</script" 提前结束 <script> 标签
const json = JSON.stringify(data, null, 2).replace(/<\//g, "<\\/");
const html = shell
  .replace("{{TITLE}}", () => escapeHtml(data.title || `${data.origin} → ${data.destination}`))
  .replace("{{STYLE}}", () => style)
  .replace("{{DATA}}", () => json)
  .replace("{{SCRIPT}}", () => script);

const output = outputArg || input.replace(/\.json$/i, "") + ".html";
await writeFile(output, html, "utf8");
console.log(`已生成 ${output}（${data.routes.length} 条方案，${Buffer.byteLength(html)} 字节）`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// 只检查渲染必需的字段；完整格式见 schema/trip.schema.json
function validate(d) {
  const p = [];
  if (typeof d !== "object" || d === null || Array.isArray(d)) return ["顶层必须是一个对象"];
  for (const k of ["title", "origin", "destination", "queriedAt"]) {
    if (typeof d[k] !== "string" || !d[k]) p.push(`缺少字符串字段 ${k}`);
  }
  if (!Array.isArray(d.routes) || d.routes.length === 0) {
    p.push("routes 必须是非空数组");
    return p;
  }
  const nDates = Array.isArray(d.dates) ? d.dates.length : 0;
  d.routes.forEach((r, i) => {
    const id = String.fromCharCode(65 + i);
    if (!r || typeof r !== "object") return p.push(`routes[${i}] 必须是对象`);
    if (!r.name) p.push(`方案 ${id} 缺少 name`);
    if (!r.total) p.push(`方案 ${id} 缺少 total`);
    if (r.effort && !["green", "blue", "red"].includes(r.effort)) p.push(`方案 ${id} 的 effort 只能是 green / blue / red`);
    if (nDates > 1 && r.datePrices && r.datePrices.length !== nDates) {
      p.push(`方案 ${id} 的 datePrices 有 ${r.datePrices.length} 项，但 dates 有 ${nDates} 项`);
    }
    (r.legs || []).forEach((l, j) => { if (!l.t) p.push(`方案 ${id} 的 legs[${j}] 缺少 t`); });
    (r.buy || []).forEach((b, j) => { if (!b.item || !b.price) p.push(`方案 ${id} 的 buy[${j}] 需要 item 和 price`); });
  });
  return p;
}
