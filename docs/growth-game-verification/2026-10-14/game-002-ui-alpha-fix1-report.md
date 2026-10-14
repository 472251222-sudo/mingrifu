# QA-G002-001 第 1 轮修复报告

状态：review，交 QA 复验；缺陷累计修复第 1 轮，不重置计数。修复范围仅 UI 命中及 Manager 另行授权的独立 Vite cache。未接入保存/成长 UI、未修改碰撞/规则/data/hook、旧资源或正式业务。

## 根因与最小修复

原命中把 pointer 逆变换到世界后 `floor` 取源 PNG Alpha。Canvas 最近邻缩小时按实际目标栅格选择源样本，该源坐标不总等于逆变换后 `floor` 的样本；分数 pointer 也会与同一已显示像素错位。实测 RED 确认 QA 两个 320×568 点击分别返回空 ID 和 `n-2`，画面上均是木屋。

现在 UI 使用 `hitScreenScene`：先取点击在 Canvas bitmap 的整数屏幕像素，复用该资源的一个 1×1 Canvas，将 Sprite 用相同缩放/绘制原点、减去整屏像素坐标绘制；直接读真实 raster Alpha。粗略矩形仅排除不可能对象，最终判断由 Canvas Alpha 给出，不猜源 PNG 的缩小样本。

所有自然/人工对象按实际逆脚点顺序检测屏幕 Alpha，前景先命中；全部不透明 Alpha 均未命中时才作人工地面占地 fallback。预览/地形/阴影/描边不作为对象 Alpha，碰撞规则未改变。1px Canvas 按 resources 缓存，点击只检测包围盒覆盖该屏幕像素的 Sprite；没有引擎迁移或大命中缓冲系统。

Manager 另授权的 cache 修复：实测 V3/game 默认都使用 `node_modules/.vite`。`vite.game.config.mjs` 新增动态仓库路径 `node_modules/.vite-growth-game`，原 V3 配置不改。缓存目录已 ignored，无硬编码机器路径、依赖安装或权限扩张。

## RED → GREEN 与实际结果

| 检查 | 实际结果 | 新证据 |
| --- | --- | --- |
| Node 命中回归，实现前 | screen raster callback 被忽略，错误返回后景，RED | [node-red](game-002-ui-alpha-fix1-node-red.txt) |
| 同回归，实现后 | 12/12 视图行为 GREEN | [node-green](game-002-ui-alpha-fix1-node-green.txt) |
| 真实 Chrome 两个 QA 点击点，实现前 | `.25`→空、`.125`→`n-2`，RED | [browser RED JSON](game-002-browser-alpha-fix1-red.json)、[日志](game-002-browser-alpha-fix1-red.txt) |
| 相同点击点，实现后 | `.25`/`.125` 均选 `o-1` | [browser GREEN JSON](game-002-browser-alpha-fix1-green.json)、[日志](game-002-browser-alpha-fix1-green.txt) |
| 全屏真实 Canvas raster 对照 | RED 2,930 差；GREEN **9,698,112 样本 0 差** | 同上 RED/GREEN JSON |
| Cache 回归，实现前/后 | 真实 Vite resolveConfig：cacheDir 相同 RED，独立 GREEN | [cache-red](game-002-ui-cache-red.txt)、[cache-green](game-002-ui-cache-green.txt) |
| 同时 Chrome 打开 V3 5191 + game 5189，两轮/每轮刷新 | 全部优化依赖 200，0 个 504、0 pageerror；实际请求 URL 的 cache 目录不同 | [cache JSON](game-002-browser-cache-fix1.json)、[日志](game-002-browser-cache-fix1.txt) |
| `node --test tests/game-view.test.mjs tests/game-build.test.mjs` 最终 | 16/16，0 失败 | [scoped](game-002-ui-alpha-fix1-scoped.txt) |
| `npm test` 最终 | 160/160，0 失败、0 跳过，包含其他负责人的当前测试 | [全套测试](game-002-ui-alpha-fix1-npm-test.txt) |
| `npm run build:game` 最终 | 成功，HTML/游戏 chunk/原资源齐全 | [构建](game-002-ui-alpha-fix1-build.txt) |
| 范围内 `git diff --check` | 退出 0 | 本轮实际命令 |

矩阵覆盖 Chrome `155.0.8059.40`：`.07` 动态倍率及 `.125/.25/.5/1/2/3/4`，初始、负坐标稀疏、自然前景三个场景，每个屏幕像素的 pointer offset `0/.25/.5/.9`。独立 oracle 将每一原 Sprite 用可见绘制矩阵绘制到完整 298×339 Canvas，读取真实 Alpha，再按前景身份与人工占地确定期望；不是把新 probe 或源 PNG 逆变换公式作为期望。

两个实际 UI 点保持 QA 尺寸和坐标：

- `.25` 原点 `[118,138]`，local `[145,143]`，client `[156,243]`，实际可见木屋→`o-1`。[截图](game-002-browser-alpha-fix1-green-ui-0.25.png)
- `.125` 原点 `[134,154]`，local `[142,159]`，client `[153,259]`，实际可见木屋→`o-1`。[截图](game-002-browser-alpha-fix1-green-ui-0.125.png)

Node 的 screen sampling 测试只验证采样回调优先于错误原 texel/后景 fallback；真正的 raster 正确性由上述真实浏览器对照证明。Cache 回归最初位于 game-view 测试，GREEN 后移到 Manager 授权的 game-build 测试，断言与输入契约保持相同。

## 文件、范围与限制

本轮增量：`scene.js`（screen Alpha callback）、`renderer.js`（1px raster probe）、`WorldCanvas.jsx`（UI 调用）、`tests/game-view.test.mjs`（新命中回归），以及另授权 `vite.game.config.mjs` / `tests/game-build.test.mjs`（独立 cache 与回归）。GameApp/styles 既有 002 成果未在本修复改动；原规则/data/hook、V3/素材均未改。本轮证据为新的 `game-002-ui-alpha-fix1-*`、cache RED/GREEN、`game-002-browser-alpha-*` 与 `game-002-browser-cache-*` 文件，旧 RED/QA/截图不覆盖。

使用 Manager 根 game5189 / V3 5191 服务；没有杀根进程或启动冲突端口。5190 当前没有根服务，本轮不声称重新做完整 Chrome preview 流程；完整 npm 构建契约仍实跑临时 preview HTTP。Safari/WebKit、真手机与最终用户视觉验收未覆盖。进入 QA 复验后，由 Manager 决定缺陷是否关闭及下一阶段；本报告不自行判 approved。
