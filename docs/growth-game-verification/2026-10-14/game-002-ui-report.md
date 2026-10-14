# GAME-002 UI 实现报告

状态：review，等待 Manager / QA。依据 [task-game-002.md](task-game-002.md)、正式 PRD 与 Manager 补充命中/排序/触控指令。UI 基线 `4d100a4`；规则由另一 Builder 独占，已使用其稳定 `ASSETS/BALANCE/createGameWorld/applyGameCommand/placementCheck/stageForXP`。无子 Agent、Git 写操作、依赖安装、旧业务/原素材/存档写入。

## 实现与范围

- 新 `scene.js` 将人工/自然对象按 `footprintOffset` 映射地面脚点，并复用地形连接规则。初始 8×8、赠送木屋左上 `(2,2)`，XP0/BP30，门前小路、自然植物及留白。仅为本地 React 内存世界，明确显示“尚未保存，刷新会重置”。没有努力/扩张假入口。
- 地图只枚举已开放 chunk，支持负坐标、稀疏区块、跨接缝路径；Bounds 包含地面和实际视觉边界，不按 PNG 透明画布计算。`.125/.25/.5/1/2/3/4` 缩放及更小动态总览，软边界与滚轮缩放；手机首屏 1×，桌面 2×。
- `renderer.js` 复用原 `drawWorld`、`objectOrder` 和真实资源；地面足迹先于 Sprite，预览作为对象进入同一脚点排序，不覆盖所有前景。选中描边通过透明外部 flood fill 生成，仅在 Alpha 外侧，不描内部空洞、不穿墙；后画前景可遮挡描边。
- 命中先扫描全部对象的逆绘制顺序 Alpha，包括自然树；再作人工占地 fallback。自然前景可显示信息，不能移动/收纳。透明边缘不会凭 Sprite 矩形抢点击。
- 建造目录/收纳目录为手机底部抽屉，选择后自动收起。预览价格、位置、合法性及确认/取消与地图同屏；锁定/余额不足/人工重叠/越界明确阻止确认。预览、取消不调用命令、不退让植物；确认成功才采用规则返回的新世界。
- 初始木屋及新建对象可免费移动、收纳、重摆，沿用同 ID；确认建造仅一次消费。拖动超过 6px 只移动相机，预览坐标不变，pointer/touch cancel 不确认。方向键调整预览、Enter 确认、Escape 取消；无预览时方向键平移相机。

唯一业务写入文件：`src/growth/game/scene.js`、`renderer.js`、`WorldCanvas.jsx`、`GameApp.jsx`、`styles.css`、`tests/game-view.test.mjs`。其他写入仅本目录 `game-002-ui-*` 与 `game-002-browser-*` 新证据。规则/持久化/hook/主记录由其各自负责人维护；没有回滚或修改他们的文件。

## 实际验证

环境：Node `v24.16.0`、npm `11.13.0`、Vite `6.4.2`、React `19.2.0`、已有 Chrome `155.0.8059.40` / Playwright；浏览器全部新建隔离上下文，不接用户 profile。

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 实现前 `node --test tests/game-view.test.mjs` | RED：缺少动态场景/命中/相机接口 | [game-002-ui-red.txt](game-002-ui-red.txt) |
| 加最小空接口后，聚焦轮廓/坐标/相机测试 | 实际断言 RED：4 失败（外轮廓、原点、动态总览、软边界），1 import 初始化通过 | [game-002-ui-behavior-red.txt](game-002-ui-behavior-red.txt) |
| 完成后 `node --test tests/game-view.test.mjs` | 最终 11 行为测试通过、0 失败。移除仅 import 的空测试；未冒称原 P2-B 测试为本轮 RED | [game-002-ui-view-final.txt](game-002-ui-view-final.txt) |
| `npm test` 最终实际运行 | 154 通过、0 失败、0 跳过，含并行负责人当时已有的规则/存储测试 | [game-002-ui-npm-test-final.txt](game-002-ui-npm-test-final.txt) |
| `npm run build:game` 最终实际运行 | 成功，HTML/游戏 chunk/资源齐全 | [game-002-ui-build-final.txt](game-002-ui-build-final.txt) |
| 隔离 Chrome 桌面 dev、320×568、390×700、独立 preview | 四个完整建造/免费调整流程通过，地图/提示/动作同屏、无页面横/纵滚动、无 console/page 错误 | [game-002-browser-r3.json](game-002-browser-r3.json)、[日志](game-002-browser-r3.txt) |
| 手机连续 touch drag 与 touchCancel | CDP `Input.dispatchTouchEvent` 发真实 touchStart/Move/End/Cancel，记录实际 `pointerType=touch`。相机移动而预览/资源/revision 不变 | 上述 JSON `touchEvents`；桌面仅 mouse drag，不声称触控 |
| 真实 PNG Alpha + 渲染数学浏览器检查 | 屋顶、墙面、透明占地 fallback、透明外侧、缩放平移后屋顶、自然前景全部返回预期 ID；预览位于自然前景之后绘制之前 | [game-002-browser-math-r2.json](game-002-browser-math-r2.json)、[日志](game-002-browser-math-r2.txt) |
| 稀疏负 chunk 真实 Canvas | 3 chunk 只绘制 192 cells，`.25` 总览包含负地块和间隔，不填充未拥有地面 | [稀疏渲染截图](game-002-browser-math-r2-sparse.png) |
| 对比 `4d100a4` 受保护源文件/PNG | 19 份 SHA-256 全部不变 | [game-002-ui-protected.json](game-002-ui-protected.json) |
| `git diff --check` 范围内 | 退出 0 | 本轮命令输出 |

Chrome 流程逐个验证：野花 30→28；越界/重叠/锁定/取消无变化；拖动与 touchCancel 不改预览、不发命令；点击初始木屋屋顶选中；移动→收纳→重摆同 `o-1`、BP28 不变；再建木屋后余额4，下一栋不足被拒；方向键/Escape/Enter；内存阶段刷新回初始；P1、game、V3 隔离哨兵原值保持。

本轮测试脚本：

```sh
GAME_RUN_ID=r3 PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-002-browser-flows.mjs
GAME_RUN_ID=r2 PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-002-browser-math.mjs
```

后续重跑换 `GAME_RUN_ID`，默认时间戳，避免覆盖证据。主流程脚本早期名为 `game-002-browser.mjs`，已更名 `game-002-browser-flows.mjs` 符合限定证据前缀。Math 的稀疏/遮挡场景是隔离测试 fixture，不是用户世界、未存档、未调用非法扩张命令。

真实截图已打开检查：

- [桌面选中木屋](game-002-browser-r3-desktop-cabin-selected.png)、[免费调整后](game-002-browser-r3-desktop-after-free-adjustment.png)
- [320×568 初始](game-002-browser-r3-phone320-short-initial.png)、[非法重叠同屏](game-002-browser-r3-phone320-short-overlap.png)、[合法预览同屏](game-002-browser-r3-phone320-short-legal-preview.png)
- [390×700 初始](game-002-browser-r3-phone390-initial.png)、[调整后](game-002-browser-r3-phone390-after-free-adjustment.png)
- [前景自然遮挡预览/选中](game-002-browser-math-r2-overlap-preview.png)

## 失败、修正与未验证项

无已知未关闭业务缺陷。本轮留存两类验证 fixture 错误：

1. [browser-r1](game-002-browser-r1.txt) 只断言 desktop camera.x 改变；3× 地图横向仍全部可见，软边界依法固定 x、允许 y 移动。修正为检测 x/y 任一变化，业务代码不改。[r2](game-002-browser-r2.json) 通过；r3 校正 JSON 桌面/手机触控标签并在最终 build 上重跑通过。所有旧截图/日志保留。
2. [math-r1](game-002-browser-math-r1.txt) 将猜测的松树坐标当不透明像素，实际该像素透明，正确命中后屋。fixture 改为在两个原 PNG 的真实 Alpha 交集中选择样本点 `(212.5,79.5)`，确认自然前景优先；业务代码不改。旧日志保留。

未验证 Safari/WebKit、真手机、云同步、正式任务接入。002 使用内存临时世界；刷新恢复、原子保存、双页冲突、努力/解锁/自然成长及土地扩张 UI 等后续阶段由 Manager 继续派工。木屋 approved 与其他 candidate 状态未改，技术测试不构成用户美术验收。dev5189/preview5190 继续供 QA 使用；001 dev logger 曾随 HMR 追加到已归档日志，已停止该旧进程并以本轮 `game-002-ui-dev.txt` 新日志重启，追加内容由 Manager 保留/归档，不由 UI Builder 改写旧文件。
