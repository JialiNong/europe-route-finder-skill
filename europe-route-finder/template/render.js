/* europe-route-finder 路线对比页渲染器 v1
 * 读取页面里 <script type="application/json" id="trip-data"> 的 JSON，渲染成对比页。
 * 方案编号按 routes 数组顺序自动生成 A、B、C…；两张表都从 routes 自动生成。
 * 标了「html」的字段允许 <b> <a> <br> 等行内标签，其余字段按纯文本处理。
 */
(function () {
  "use strict";
  var app = document.getElementById("app") || document.body.appendChild(document.createElement("div"));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function html(s) { return s == null ? "" : String(s); }
  function letter(i) { return String.fromCharCode(65 + i); }
  // 取价格字符串里的第一个数字，用来找最低价（「≈27€」→27，「20.49–23.49€」→20.49）
  function num(s) {
    var m = String(s == null ? "" : s).replace(/,/g, ".").match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  function tag(effort) {
    var map = { green: "省事", blue: "中等", red: "折腾" };
    var k = map[effort] ? effort : "blue";
    return '<span class="tag ' + k + '"><i></i>' + map[k] + "</span>";
  }
  function link(l) {
    return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.text) + "</a>";
  }

  function render(d) {
    var routes = d.routes || [];
    var out = [];

    // 页头
    var eyebrow = d.eyebrow || [d.origin + " → " + d.destination, d.dateLabel, "第 " + (d.version || 1) + " 版"].filter(Boolean).join(" · ");
    out.push('<header><div class="eyebrow">' + esc(eyebrow) + "</div>");
    out.push("<h1>" + esc(d.heading || (d.origin + " → " + d.destination)) + "</h1>");
    if (d.intro) out.push('<p class="route-line">' + html(d.intro) + "</p>");
    out.push("</header>");

    // 结论
    if (d.verdict) {
      out.push('<div class="verdict"><h2>结论</h2>');
      if (d.verdict.items && d.verdict.items.length) {
        out.push("<ul>" + d.verdict.items.map(function (x) { return "<li>" + html(x) + "</li>"; }).join("") + "</ul>");
      }
      (d.verdict.alerts || (d.verdict.alert ? [d.verdict.alert] : [])).forEach(function (a) {
        out.push('<p class="alert">' + html(a) + "</p>");
      });
      out.push("</div>");
    }

    // 放宽条件能省多少
    if (d.relax && d.relax.length) {
      out.push('<section><h2 style="margin-bottom:10px">放宽条件能省多少</h2><ul class="notes">' +
        d.relax.map(function (x) { return "<li>" + html(x) + "</li>"; }).join("") + "</ul></section>");
    }

    // 日期 × 方案价格表（从 routes[].datePrices 生成，每列最低价自动标绿）
    var dates = d.dates || [];
    var priced = routes.filter(function (r) { return r.datePrices && r.datePrices.length; });
    if (dates.length > 1 && priced.length) {
      var colMin = dates.map(function (_, j) {
        var vals = priced.map(function (r) { return num(r.datePrices[j]); }).filter(function (v) { return !isNaN(v) && v > 0; });
        return vals.length ? Math.min.apply(null, vals) : NaN;
      });
      out.push('<section><h2 style="margin-bottom:10px">' + esc(d.dateTableTitle || "日期 × 方案价格") + '</h2><div class="scroll"><table><thead><tr><th>方案</th>');
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
      var minPrice = Math.min.apply(null, routes.map(function (r) { return num(r.price || r.total); }).filter(function (v) { return !isNaN(v) && v > 0; }));
      out.push('<section><h2 style="margin-bottom:10px">' + esc(d.overviewTitle || "总览") + '</h2><div class="scroll"><table><thead><tr><th>方案</th><th>折腾程度</th>' +
        (hasStay ? "<th>过夜</th>" : "") + "<th>换乘</th><th>出发 → 到达</th><th>后备</th><th>价格</th></tr></thead><tbody>");
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
        out.push('<div><div class="block-title">在哪里买最便宜</div><div class="buy">');
        r.buy.forEach(function (b) {
          out.push("<span>" + esc(b.item) + (b.where ? '<br><span class="where">' + html(b.where) + "</span>" : "") + '</span><span class="p">' + esc(b.price) + "</span>");
        });
        out.push('<span class="total-row">' + esc(r.totalLabel || "合计") + '</span><span class="p total-row">' + esc(r.total) + "</span></div></div>");
      }
      if (r.notes && r.notes.length) {
        out.push('<ul class="notes">' + r.notes.map(function (n) { return "<li>" + html(n) + "</li>"; }).join("") + "</ul>");
      }
      out.push("</section>");
    });

    // 其他小节（例如「周六共用的后备车」）
    (d.sections || []).forEach(function (s) {
      out.push('<section><h2 style="margin-bottom:10px">' + esc(s.title) + "</h2>");
      (s.groups || [{ items: s.items, caption: s.caption }]).forEach(function (g) {
        if (g.caption) out.push('<p class="small muted" style="margin:10px 0 6px">' + html(g.caption) + "</p>");
        if (g.items && g.items.length) out.push('<ul class="notes">' + g.items.map(function (x) { return "<li>" + html(x) + "</li>"; }).join("") + "</ul>");
      });
      out.push("</section>");
    });

    // 排除的方案
    if (d.excluded && d.excluded.length) {
      out.push('<section class="excluded"><h2>看过但排除的方案</h2>' + d.excluded.map(function (e) {
        return '<div class="ex"><b>' + esc(e.name) + "</b><span>" + html(e.why) + "</span></div>";
      }).join("") + "</section>");
    }

    // 页脚
    var f = d.footer || {};
    out.push("<footer>");
    out.push("<p>查询时间：" + esc(d.queriedAt || "") + "。价格是查询时的快照，以官网为准。</p>");
    (f.paragraphs || []).forEach(function (p) { out.push("<p>" + html(p) + "</p>"); });
    if (f.links && f.links.length) {
      out.push("<ul>" + f.links.map(function (row) {
        return "<li>" + (Array.isArray(row) ? row : [row]).map(link).join(" · ") + "</li>";
      }).join("") + "</ul>");
    }
    out.push("</footer>");

    app.className = "wrap";
    app.innerHTML = out.join("");
    if (d.title) document.title = d.title;
  }

  try {
    var el = document.getElementById("trip-data");
    if (!el) throw new Error("页面里没有找到 id=\"trip-data\" 的 JSON。");
    render(JSON.parse(el.textContent));
  } catch (e) {
    app.className = "wrap";
    app.innerHTML = '<div class="render-error">路线页渲染失败：' + esc(e.message) + "</div>";
  }
})();
