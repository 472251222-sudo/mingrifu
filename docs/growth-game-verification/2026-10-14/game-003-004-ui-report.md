# GAME-003/004 UI 集成报告

状态：`review`，UI 源码冻结，完整候选发布仍被 **QA-DATAUI-002 / P1 高 / A11** 阻断。该缺陷由原数据负责人修复；本报告不把受控制的双页测试通过作为原生并发安全证明，不标记全阶段 technical_done 或美术 approved。

基线：`a9ca5d0`。Builder 仅改五个已分配 UI 文件及一个新集成测试，未改规则、persistence、Hook、旧业务或素材。Manager 管理 Git、主记录与长期服务器。

## 实现与冻结范围

| 文件 | 变化 |
| --- | --- |
| `src/growth/game/GameApp.jsx` | 接入已审查 `useGameWorld`；保存成功才发布操作结果、关闭预览；努力、资源/阶段/解锁/历史、扩张、只读/错误/重试/取消/重读/原始下载。 |
| `src/growth/game/WorldCanvas.jsx` | 扩张模式候选地块总览与聚焦，成功后新世界总览；保留真实 touch pan、键盘、滚轮和屏幕 Alpha 命中。 |
| `src/growth/game/scene.js` | 候选地块 bounds 与实际发布前后资源/生态反馈差值。 |
| `src/growth/game/renderer.js` | Sprite 下方绘制扩张候选/选中区域；保留已验收渲染、遮挡和 Alpha 修复。 |
| `src/growth/game/styles.css` | 手机同屏四项主操作、努力抽屉、候选列表、固定恢复按钮。 |
| `tests/game-integration.test.mjs` | 四项真实规则/视图集成测试：生态步数与植物最终 diff、幂等反馈、免费/付费反馈、负坐标扩张预览 bounds。 |

完整 SHA256/字节清单：[game-003-004-ui-source-hashes.json](game-003-004-ui-source-hashes.json)。GameApp 稳定 SHA256：`fc3ec93af4364068187b06ee91c16de080f7b77d3d50059b340087dd3447b226`。

努力提供 10/25/50 快捷、自定义 1..180 整数分钟和可选短标签，明确标为模拟、不连接正式任务。每次提交生成一次 UUID/occurredAt，pending 重试沿用同 command/candidate。反馈在 Hook 实际发布世界后的 effect 比较 before/after，避免 await 后闭包旧世界报错奖励；同事件 no-op 明确零重复奖励。生态步数按跨越 50XP 边界计算，最终植物变化数单独计算；人工布局不参与自然反馈变更。

永久 XP、BP、阶段/进度/下一解锁内容和最近五项事件可见。扩张展示阶段与余额限制，支持四向/负坐标相邻区块；候选 ghost 只扩大相机 bounds，不提前开放土地。确认成功一次扣费后自动总览，新地及接缝可建，旧对象与道路坐标不移。

初始种子先保存，真实 saved 状态替代临时内存提示。loading/busy/fault/readonly/pending 分开反馈；原记录未成功读取的种子预览明确未读取或保存。失败保留旧世界和资源，重试/取消同屏；冲突只允许重读，重读清理旧选择/预览。损坏、未知版本、权限故障不 reset，原始 raw 仅 string 可下载，不经过 JSON 格式化。无锁能力只读。UI 从未直接写 localStorage 或自行 setWorld。

## RED → GREEN 与修复

- 当前任务真实浏览器 RED：[release-game-ui-red.json](release-game-ui-red.json)、[日志](release-game-ui-red.txt)、[脚本](release-game-ui-red.mjs)。当时没有努力/扩张入口，独立新 key 未保存，仍显示临时内存提示；观察了预期失败。
- 数学集成 RED：[game-003-004-ui-unit-red.txt](game-003-004-ui-unit-red.txt)，缺少本轮反馈/bounds helper；最小实现 GREEN：[game-003-004-ui-unit-green.txt](game-003-004-ui-unit-green.txt)，4/4。
- **QA-DATAUI-001 第 1 轮**：320×568 努力抽屉内 quota 失败后原事务安全，但模态遮挡外层恢复按钮。真实 [RED](release-game-quota-effort-r1-red.json)/[日志](release-game-quota-effort-r1-red.txt) 保留。修复仅在 effort+pending+error+非 busy 收起抽屉，原 attempt/UUID/candidate 保留。真实 [GREEN](release-game-quota-effort-r1-green.json)/[日志](release-game-quota-effort-r1-green.txt) 显示恢复按钮直接命中，两个写尝试候选字节完全一致，重试只一次 50XP/10BP、生态一步；另一失败努力取消后原始记录不变。独立数据 QA 已复验此轮通过，缺陷状态由 Manager 记录。
- 第一轮功能脚本桌面通过，320 移动目标恰与地图悬浮缩放按钮相交而测试未命中；[r1 JSON](release-game-flows-r1.json)/[失败截图](release-game-flows-r1-phone320-failure.png) 保留。测试定位 helper 增加真实 `elementFromPoint` 检查，并用相机缩放/pan 露出目标；没有修改业务绕过。r2 四环境通过。

## 实际验证

环境：macOS、Google Chrome `155.0.8059.40`、隔离 Playwright BrowserContext；手机是 Chrome 触控模拟，连续拖动使用 CDP `Input.dispatchTouchEvent` 的 start/move/end，按钮与地图使用真实 touch tap。未读取或重置用户存档。

| 验证 | 实际结果与证据 |
| --- | --- |
| `npm test` | 164/164，0 fail/skip；[完整日志](game-003-004-ui-npm-test-final.txt)。这是修复后、底层并发 guard 修复前的时点结果。 |
| `npm run build:game` | 成功，41 modules，JS `index-Dgg0mwrq.js` 243.21kB、CSS `index-BjL3rmA_.css` 7.03kB；[完整日志](game-003-004-ui-build-final.txt)。 |
| `git diff --check`，仅六个 UI/test 路径 | 退出 0，无空白错误。 |
| 桌面 1280×900 dev5189 | 完整游戏 UI 闭环通过。 |
| 320×568、390×700 dev5189 | 同屏闭环通过，document 无横/纵溢出，地图仍可用；真实 touch pan 保留预览与世界，没有误建。 |
| build production preview5190，1280×900 | 同一生产 GameApp 完整闭环通过，非 data harness。 |
| quota /坏档/未知版本/getter/无锁/404 | 真实 GameApp 故障场景通过，详见下方。 |
| 同事件 + 七天虚拟时间 | 实际 UI no-op 无重复奖励，七天快进并刷新后原始记录不变、无自动计奖/扣罚。 |

功能脚本：[release-game-flows.mjs](release-game-flows.mjs)；[四环境 r2 JSON](release-game-flows-r2.json)/[日志](release-game-flows-r2.txt)。实际流程：初始已存 0XP/30BP、gift o-1；扩张锁定；人工重叠/越界取消不收费；花 30→28BP；屋顶选择→免费移动→收纳→同 ID 重摆；50/50/25 到 125XP/53BP、扎根解锁；东方相邻扩张减 20BP，原 objects/path 不变；新地花到 31BP、接缝木屋到 7BP；自定义 175 分钟带标签到 300XP/42BP、繁茂开放；历史、刷新、关页同隔离上下文重开恢复原记录一致；隔离 P1/V3 哨兵未变化。

截图示例：[320 初始](release-game-flows-r2-phone320-initial.png)、[320 扩张候选](release-game-flows-r2-phone320-expand-preview.png)、[390 300XP](release-game-flows-r2-phone390-growth300.png)、[生产重开恢复](release-game-flows-r2-production-restored.png)、[quota 可达恢复](release-game-quota-effort-r1-green-failed.png)。全部 r1/r2 原始 PNG/JSON/TXT 留在本目录。

故障脚本：[release-game-faults.mjs](release-game-faults.mjs)；[r1 JSON](release-game-faults-r1.json)/[日志](release-game-faults-r1.txt)。真实 UI 初始 quota 保留未保存只读 seed、重试同 seed 单 gift；建造 quota 原值/BP 不变、重试同候选一次扣费、第二失败取消不变；坏档与未知版本零写入、原始文本下载一致；localStorage getter 恢复后重读合法 25XP 世界且不重赠；无 WebLocks 只读零写；生产 PNG 404 后重新加载资源不重写世界。

该脚本双标签用人为持锁 barrier 排队并释放的本次 run 一成功、一冲突、败方不扣发且重读成功。这是受控场景结果。独立 QA 随后发现真实原生竞争可间歇双方成功并覆盖事件，因此**A11 的并发条款尚未通过**，该 r1 “passed” 字段不得解释为完整并发验收通过。

幂等/时钟脚本：[release-game-idempotency-clock.mjs](release-game-idempotency-clock.mjs)；[JSON](release-game-idempotency-r1.json)/[日志](release-game-idempotency-r1.txt)。隔离真实 UI 固定同 UUID/occurredAt 再提交同 10 分钟事件，记录和 XP10/BP32 不变；恢复生成 API、虚拟快进 7 天并刷新仍不变。

浏览器命令均使用现有运行时，无新增依赖；例如：

```sh
PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright GAME_RUN_ID=r2 node docs/growth-game-verification/2026-10-14/release-game-flows.mjs
PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright GAME_RUN_ID=r1 node docs/growth-game-verification/2026-10-14/release-game-faults.mjs
PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright GAME_RUN_ID=effort-r1-green node docs/growth-game-verification/2026-10-14/release-game-quota-effort.mjs
PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright GAME_RUN_ID=r1 node docs/growth-game-verification/2026-10-14/release-game-idempotency-clock.mjs
```

上述命令说明历史实际执行方法，后续重跑必须替换 GAME_RUN_ID 为唯一新值，不能覆盖旧证据。5189/5190/5191 均复用 Manager 根会话服务，本轮未停止它们。

## 验收边界、保护与待办

本轮自身实证覆盖 A01–03、A05–10、A12，以及 A13 单次扩张/资源失败恢复、A14。A04 继续沿用 GAME002 已独立复验的实际屏幕 Alpha 修复，当前屋顶选择/缩放 pan 闭环通过。A08 空地不足等纯规则详细边界已有规则阶段证据，本轮 UI 未另外制造满地图。A13 多次负向扩张与所有地块总览、余额不足由独立数据 QA 另测；Manager 告知真实 320/390/生产全部通过，本报告不冒充自身运行该组。

A11 存储故障保护/重试/取消/原始下载/无锁/哨兵已有真实 GameApp 证据；**QA-DATAUI-002 / P1 高仍 open**：同 origin 两个原生 token 相同生产页竞争，可双方宣称成功，后写覆盖先前事件、刷新使已宣称奖励丢失。独立 QA 可复现详情见 [qa-defects.md](qa-defects.md) 与 [release-data-qa-preaudit/](release-data-qa-preaudit/)。原数据 owner 调查并负责可靠 guard；UI 不改 data、不添加延时/回避并发。底层修复后需新 build、完整 suite 和真实生产 UI 并发/闭环复验，再由 QA/Manager统一收束。

A15 保护检查：[game-003-004-ui-protected.json](game-003-004-ui-protected.json)，19 文件逐字节与 a9ca5d0 相同：V3 main/App/config、旧 homestead 入口/renderer/world/scene、manifest 和全部 11 张原 PNG。完整旧 P1/V3 真实回归由 Manager 在独立5191执行，本 Builder未重复运行或修改旧代码。素材加载直接复用既有资源；无美术重绘，candidate 状态未自动改 approved。

未覆盖：真实硬件手机、Safari/WebKit、跨完整操作系统/浏览器重启；“关页重开”是同隔离 Chrome context 的新 page。虚拟时间只证明规则/界面不会因时钟自动奖惩，不声称实际等待七天。底层并发阻断项未修复前不得对外宣称完整发布通过。

证据写入仅本轮授权前缀；四个浏览器脚本与 RED 脚本、单元/构建日志、原始 JSON/PNG/TXT、此报告和保护/源码 hashes 全保留。完整交付文件清单（含大小与 SHA256）：[game-003-004-ui-file-list.json](game-003-004-ui-file-list.json)。没有提交、Push、安装、调用外部美术工具或修改主记录。UI 现等待独立 QA 与 Manager 后续安排。
