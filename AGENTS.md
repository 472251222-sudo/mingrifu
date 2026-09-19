# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 已确认的本轮设计修正（2026-09-19）

用户要求按《明日复_产品与前端开发设计文档_合并版.md》修正现有样本。保留现有代码与素材，优先修正首屏能看到具体今日任务、正文14–16px与辅助文字可读性、目标名称/Day/阶段的信息层级、按需右侧任务详情、至少树木模式可感知的连续生长与里程碑。不要将构建或功能测试通过等同于视觉验收通过。不扩展真实AI、后端或未确认的量化目标范围。
