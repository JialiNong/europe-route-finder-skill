# AGENTS.md

这个仓库是一个给 AI agent 用的「欧洲交通路线查找」skill。Cursor、Codex、Gemini CLI、Claude Code 等会自动读这个文件。

## 用户让你查欧洲内怎么去某地时

1. 读 `europe-route-finder/SKILL.md`，按里面第 0–7 步做。
2. 读 `europe-route-finder/profile.md`，这是用户的固定情况（出发地、车票、折扣卡、住宿偏好、不坐什么车）。
3. 查完后按 `europe-route-finder/schema/trip.schema.json` 写一份行程 JSON，存到 `trips/<行程名>.json`。照着 `europe-route-finder/examples/leipzig-vienna.json` 写。
4. 渲染成页面，不要手写 HTML：

   ```bash
   node europe-route-finder/scripts/render.mjs trips/<行程名>.json
   # 或者
   python3 europe-route-finder/scripts/render.py trips/<行程名>.json
   ```

5. 把生成的 `trips/<行程名>.html` 路径告诉用户，并用几句话总结推荐方案。

## 规则

- 回复和页面都用中文（除非用户换了语言）。
- 价格必须是实时查到的，并写明在哪里买、查询时间；查不到就写「未能查到」，不要估。
- 不下单，不填写个人或支付信息，遇到验证码或登录不要绕过。
- 改页面样式时只改 `europe-route-finder/template/`，改完用示例重新渲染检查一遍。
