/* europe-route-finder 路线对比页渲染器 v2 · route comparison page renderer
 * 读取 <script type="application/json" id="trip-data"> 的 JSON，渲染成对比页。
 * 方案编号按 routes 顺序自动生成 A、B、C…；两张表都从 routes 自动生成。
 * 双语：任何文本字段都可以写成 {"zh": "…", "en": "…"}，页面右上角可切换中文 / English。
 * 标了「html」的字段只保留 <b> <i> <a> <br> 等行内标签，其余按纯文本处理。
 */
(function () {
  "use strict";
  var app = document.getElementById("app") || document.body.appendChild(document.createElement("div"));

  var DICT = {
    zh: {
      version: function (n) { return "第 " + n + " 版"; },
      verdict: "结论", relax: "放宽条件能省多少", dateTable: "日期 × 方案价格", overview: "总览",
      route: "方案", effort: "折腾程度", stay: "过夜", transfers: "换乘", times: "出发 → 到达", backup: "后备", price: "价格",
      whereBuy: "在哪里买最便宜", total: "合计", excluded: "看过但排除的方案",
      green: "省事", blue: "中等", red: "折腾",
      queried: function (s) { return "查询时间：" + s + "。价格是查询时的快照，以官网为准。"; },
      print: "导出 / 打印 PDF",
      noData: function (id) { return "页面里没有找到 id=\"" + id + "\" 的 JSON。"; },
      renderFail: "路线页渲染失败："
    },
    en: {
      version: function (n) { return "v" + n; },
      verdict: "Bottom line", relax: "What relaxing the constraints would save", dateTable: "Price by date and route", overview: "Overview",
      route: "Route", effort: "Effort", stay: "Overnight", transfers: "Changes", times: "Depart → arrive", backup: "Backup", price: "Price",
      whereBuy: "Cheapest place to buy each part", total: "Total", excluded: "Checked and ruled out",
      green: "Easy", blue: "Moderate", red: "Fiddly",
      queried: function (s) { return "Checked " + s + ". Prices are a snapshot from that time; the operator's own site is authoritative."; },
      print: "Print / save as PDF",
      noData: function (id) { return "No JSON with id=\"" + id + "\" found on the page."; },
      renderFail: "Could not render the route page: "
    }
  };

  /* ---- 共用：双语、HTML 白名单、链接校验 · shared: i18n, HTML allowlist, URL check ---- */
  var LANG_KEY = "travel-skill-lang";
  var CUR = /^zh/i.test((navigator.language || "")) ? "zh" : "en";
  function t(k) {
    var s = DICT[CUR][k];
    if (s == null) s = DICT.zh[k];
    return typeof s === "function" ? s.apply(null, Array.prototype.slice.call(arguments, 1)) : s;
  }
  // 本地化字段：任何字符串（或数组）都可以写成 {"zh": "…", "en": "…"}；缺一种语言时退回另一种
  function isLoc(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    var k = Object.keys(v);
    return k.length > 0 && k.every(function (x) { return x === "zh" || x === "en"; });
  }
  function localize(v, lang) {
    if (isLoc(v)) {
      var pick = v[lang];
      if (pick == null || pick === "") pick = v[lang === "zh" ? "en" : "zh"];
      return localize(pick, lang);
    }
    if (Array.isArray(v)) return v.map(function (x) { return localize(x, lang); });
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = localize(v[k], lang); });
      return o;
    }
    return v;
  }
  function scanLangs(v, acc) {
    if (isLoc(v)) Object.keys(v).forEach(function (k) { if (v[k] != null && v[k] !== "") acc[k] = 1; });
    if (v && typeof v === "object") Object.keys(v).forEach(function (k) { scanLangs(v[k], acc); });
    return acc;
  }
  function availableLangs(raw) {
    var langs = (Array.isArray(raw.languages) ? raw.languages : []).filter(function (l) { return l === "zh" || l === "en"; });
    if (!langs.length) langs = Object.keys(scanLangs(raw, {})).sort().reverse(); // zh 在前
    if (!langs.length) langs = [raw.lang === "en" ? "en" : "zh"];
    return langs;
  }
  function initialLang(raw, langs) {
    var q = (location.search.match(/[?&]lang=(zh|en)\b/) || [])[1];
    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* 隐私模式等 */ }
    var order = [q, saved, raw.lang, CUR, langs[0]];
    for (var i = 0; i < order.length; i++) if (order[i] && langs.indexOf(order[i]) >= 0) return order[i];
    return langs[0];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    return /^(https?:|mailto:|#)/i.test(u) ? u : "";
  }
  function a(url, text) {
    var u = safeUrl(url);
    return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(text) + "</a>" : esc(text);
  }
  // 标「html」的字段只保留少量行内标签，链接只允许 http(s) / mailto，其余标签去壳、属性全部去掉
  var KEEP = { B: 1, STRONG: 1, I: 1, EM: 1, A: 1, BR: 1, SMALL: 1, CODE: 1, SPAN: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1, SVG: 1, MATH: 1, LINK: 1, META: 1 };
  function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1 || DROP[n.tagName.toUpperCase()]) { node.removeChild(n); return; }
      clean(n);
      var tag = n.tagName.toUpperCase();
      if (!KEEP[tag]) {
        while (n.firstChild) node.insertBefore(n.firstChild, n);
        node.removeChild(n);
        return;
      }
      var href = tag === "A" ? safeUrl(n.getAttribute("href")) : "";
      Array.prototype.slice.call(n.attributes).forEach(function (at) { n.removeAttribute(at.name); });
      if (href) { n.setAttribute("href", href); n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
    });
  }
  function html(s) {
    if (s == null || s === "") return "";
    s = String(s);
    if (!/[<&]/.test(s)) return s;
    var tpl = document.createElement("template");
    tpl.innerHTML = s;
    clean(tpl.content);
    var box = document.createElement("div");
    box.appendChild(tpl.content);
    return box.innerHTML;
  }
  function toolbar(langs) {
    var s = '<div class="toolbar no-print">';
    if (langs.length > 1) {
      s += '<div class="lang-switch" role="group" aria-label="Language / 语言">' + langs.map(function (l) {
        return '<button type="button" data-lang="' + l + '" aria-pressed="' + (l === CUR) + '">' + (l === "zh" ? "中文" : "EN") + "</button>";
      }).join("") + "</div>";
    }
    return s + '<button type="button" class="print-btn" data-print>' + esc(t("print")) + "</button></div>";
  }
  // 启动：读 JSON → 选语言 → 渲染；切换语言时保持滚动位置
  function boot(dataId) {
    var raw, langs;
    function draw() {
      document.documentElement.lang = CUR === "zh" ? "zh-CN" : "en";
      var d = localize(raw, CUR);
      render(d, toolbar(langs));
      if (d.title) document.title = d.title;
    }
    try {
      var el = document.getElementById(dataId);
      if (!el) throw new Error(t("noData", dataId));
      raw = JSON.parse(el.textContent);
      langs = availableLangs(raw);
      CUR = initialLang(raw, langs);
      draw();
    } catch (e) {
      app.className = "wrap";
      app.innerHTML = '<div class="render-error">' + esc(t("renderFail")) + esc(e.message) + "</div>";
      return;
    }
    app.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-lang],[data-print]") : null;
      if (!b) return;
      if (b.hasAttribute("data-print")) { window.print(); return; }
      var l = b.getAttribute("data-lang");
      if (!l || l === CUR) return;
      CUR = l;
      try { localStorage.setItem(LANG_KEY, l); } catch (x) { /* ignore */ }
      var y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    });
  }
  /* ---- 共用部分结束 · end of shared part ---- */


  function letter(i) { return String.fromCharCode(65 + i); }
  // 取价格字符串里的第一个数字，用来找最低价（「≈27€」→27，「20.49–23.49€」→20.49）
  function num(s) {
    var m = String(s == null ? "" : s).replace(/,/g, ".").match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  function tag(effort) {
    var k = { green: 1, blue: 1, red: 1 }[effort] ? effort : "blue";
    return '<span class="tag ' + k + '"><i></i>' + esc(t(k)) + "</span>";
  }
  function h2(s) { return '<h2 class="sec">' + esc(s) + "</h2>"; }
  function notes(items) {
    return items && items.length ? '<ul class="notes">' + items.map(function (x) { return "<li>" + html(x) + "</li>"; }).join("") + "</ul>" : "";
  }

  function render(d, bar) {
    var routes = d.routes || [];
    var out = [bar];

    // 页头
    var eyebrow = d.eyebrow || [d.origin + " → " + d.destination, d.dateLabel, t("version", d.version || 1)].filter(Boolean).join(" · ");
    out.push('<header><div class="eyebrow">' + esc(eyebrow) + "</div>");
    out.push("<h1>" + esc(d.heading || (d.origin + " → " + d.destination)) + "</h1>");
    if (d.intro) out.push('<p class="route-line">' + html(d.intro) + "</p>");
    out.push("</header>");

    // 结论
    if (d.verdict) {
      out.push('<div class="verdict"><h2>' + esc(t("verdict")) + "</h2>");
      if (d.verdict.items && d.verdict.items.length) {
        out.push("<ul>" + d.verdict.items.map(function (x) { return "<li>" + html(x) + "</li>"; }).join("") + "</ul>");
      }
      (d.verdict.alerts || (d.verdict.alert ? [d.verdict.alert] : [])).forEach(function (x) {
        out.push('<p class="alert">' + html(x) + "</p>");
      });
      out.push("</div>");
    }

    // 放宽条件能省多少
    if (d.relax && d.relax.length) out.push("<section>" + h2(t("relax")) + notes(d.relax) + "</section>");

    // 日期 × 方案价格表（从 routes[].datePrices 生成，每列最低价自动标绿）
    var dates = d.dates || [];
    var priced = routes.filter(function (r) { return r.datePrices && r.datePrices.length; });
    if (dates.length > 1 && priced.length) {
      var colMin = dates.map(function (_, j) {
        var vals = priced.map(function (r) { return num(r.datePrices[j]); }).filter(function (v) { return !isNaN(v) && v > 0; });
        return vals.length ? Math.min.apply(null, vals) : NaN;
      });
      out.push("<section>" + h2(d.dateTableTitle || t("dateTable")) + '<div class="scroll"><table><thead><tr><th>' + esc(t("route")) + "</th>");
      dates.forEach(function (x) { out.push("<th>" + esc(x) + "</th>"); });
      out.push("</tr></thead><tbody>");
      routes.forEach(function (r, i) {
        if (!r.datePrices || !r.datePrices.length) return;
        out.push("<tr><td>" + letter(i) + " " + esc(r.short || r.name) + "</td>");
        dates.forEach(function (_, j) {
          var p = r.datePrices[j];
          var best = num(p) === colMin[j];
          out.push('<td class="num' + (best ? " best" : "") + '">' + esc(p == null || p === "" ? "—" : p) + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table></div>");
      if (d.dateTableNote) out.push('<p class="small muted" style="margin-top:8px">' + html(d.dateTableNote) + "</p>");
      out.push("</section>");
    }

    // 总览表（有任何一条写了 stay 才显示「过夜」列；最低价自动标绿）
    if (routes.length) {
      var hasStay = routes.some(function (r) { return r.stay; });
      var prices = routes.map(function (r) { return num(r.price || r.total); }).filter(function (v) { return !isNaN(v) && v > 0; });
      var minPrice = prices.length ? Math.min.apply(null, prices) : NaN;
      out.push("<section>" + h2(d.overviewTitle || t("overview")) + '<div class="scroll"><table><thead><tr><th>' + esc(t("route")) + "</th><th>" + esc(t("effort")) + "</th>" +
        (hasStay ? "<th>" + esc(t("stay")) + "</th>" : "") + "<th>" + esc(t("transfers")) + "</th><th>" + esc(t("times")) + "</th><th>" + esc(t("backup")) + "</th><th>" + esc(t("price")) + "</th></tr></thead><tbody>");
      routes.forEach(function (r, i) {
        var p = r.price || r.total;
        out.push("<tr><td>" + letter(i) + " " + esc(r.short || r.name) + "</td><td>" + tag(r.effort) + "</td>" +
          (hasStay ? "<td>" + esc(r.stay || "—") + "</td>" : "") +
          '<td class="num">' + esc(r.transfers || "—") + '</td><td class="num">' + esc(r.times || "—") + "</td><td>" + esc(r.backup || "—") +
          '</td><td class="num' + (num(p) === minPrice ? " best" : "") + '">' + esc(p) + "</td></tr>");
      });
      out.push("</tbody></table></div>");
      if (d.overviewNote) out.push('<p class="small muted" style="margin-top:8px">' + html(d.overviewNote) + "</p>");
      out.push("</section>");
    }

    // 每条方案的卡片
    routes.forEach(function (r, i) {
      out.push('<section class="route" id="' + letter(i).toLowerCase() + '"><div class="route-head"><div style="display:flex;flex-direction:column;gap:4px">' +
        (r.tag ? '<span class="pick">' + esc(r.tag) + "</span>" : "") + "<h3>" + letter(i) + " · " + esc(r.name) + '</h3></div><div class="total">' + esc(r.total) + "</div></div>");
      if (r.summary) out.push("<p>" + html(r.summary) + "</p>");
      if (r.legs && r.legs.length) {
        out.push('<div class="legs">' + r.legs.map(function (l) {
          return '<div class="leg' + (l.stay ? " stay" : "") + '"><span class="t">' + esc(l.t) + '</span><span class="what">' + html(l.what) + "</span></div>";
        }).join("") + "</div>");
      }
      if (r.buy && r.buy.length) {
        out.push('<div><div class="block-title">' + esc(t("whereBuy")) + '</div><div class="buy">');
        r.buy.forEach(function (b) {
          out.push("<span>" + esc(b.item) + (b.where ? '<br><span class="where">' + html(b.where) + "</span>" : "") + '</span><span class="p">' + esc(b.price) + "</span>");
        });
        out.push('<span class="total-row">' + esc(r.totalLabel || t("total")) + '</span><span class="p total-row">' + esc(r.total) + "</span></div></div>");
      }
      out.push(notes(r.notes));
      out.push("</section>");
    });

    // 其他小节（例如「周六共用的后备车」）
    (d.sections || []).forEach(function (s) {
      out.push("<section>" + h2(s.title));
      (s.groups || [{ items: s.items, caption: s.caption }]).forEach(function (g) {
        if (g.caption) out.push('<p class="small muted" style="margin:10px 0 6px">' + html(g.caption) + "</p>");
        out.push(notes(g.items));
      });
      out.push("</section>");
    });

    // 排除的方案
    if (d.excluded && d.excluded.length) {
      out.push('<section class="excluded"><h2>' + esc(t("excluded")) + "</h2>" + d.excluded.map(function (e) {
        return '<div class="ex"><b>' + esc(e.name) + "</b><span>" + html(e.why) + "</span></div>";
      }).join("") + "</section>");
    }

    // 页脚
    var f = d.footer || {};
    out.push("<footer><p>" + esc(t("queried", d.queriedAt || "")) + "</p>");
    (f.paragraphs || []).forEach(function (p) { out.push("<p>" + html(p) + "</p>"); });
    if (f.links && f.links.length) {
      out.push("<ul>" + f.links.map(function (row) {
        return "<li>" + (Array.isArray(row) ? row : [row]).map(function (l) { return a(l.url, l.text); }).join(" · ") + "</li>";
      }).join("") + "</ul>");
    }
    out.push("</footer>");

    app.className = "wrap";
    app.innerHTML = out.join("");
  }

  boot("trip-data");
})();
