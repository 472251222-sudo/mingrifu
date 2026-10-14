# GAME003-GUARD-UI-R1

状态：`review`，属于 QA-DATAUI-002 第 1 轮的必要 UI 适配；本报告不自行关闭底层并发缺陷。GameApp 新冻结 SHA256：`20bec0ec365694797ecaa26cbf719bbe39190f10a9c2a36a27a928a72bbf44ef`。

Manager 授权仅改 `src/growth/game/GameApp.jsx`。已与数据 owner 核对：`checkpoint_pending` 或尚未恢复的 checkpoint 状态，Hook/controller 保持 readonly 和同 owner/command/candidate pending；cancel 返回 false、reload 返回 false且保留操作；同 owner retry 可恢复。普通 quota cancel true、普通 conflict reload true语义不变。

实际检查原 UI 发现：`clearOperation` 忽略 cancel 返回值而清 attempt，`reload` await 前清 attempt。于是被拒绝的取消会误报已取消；随后保存原 effort 的 retry 误报初始世界保存。修复仅两个 handler：pending cancel false 时保留全部 UI attempt/preview/选择，提示操作保留、重试或下载；reload 只有返回 true 后才清 UI attempt/选择/预览并总览。数据、规则、其他 UI 文件未改。

## 真实 RED / GREEN

脚本：[release-game-guard-ui.mjs](release-game-guard-ui.mjs)。真实生产 GameApp、Hook/controller、原生 IndexedDB guard，无 Hook mock。隔离 Chrome context 预置合法旧 localStorage seed、guard DB 初始为空；仅故障注入：世界 key 的 Storage.setItem 抛 quota，guard store.delete 请求 success 后 transaction.abort 使 metadata 回滚失败。恢复这两个外部故障后调用真实 UI retry。

[RED JSON](release-game-guard-ui-r1-red.json)/[日志](release-game-guard-ui-r1-red.txt) 实际观察：320 努力取消误报已取消，320/390 两种拒绝路径后 retry 奖励反馈错误。第一版建造 fixture 未滚动目录而误选锁定阔树，等不到 checkpoint error；该测试错误与后续截图保留，不能作为业务 RED。脚本增加目录 scrollIntoView 和触控后实际 frame 等待；未额外改业务、未增加修复轮数。

[GREEN verified](release-game-guard-ui-r1-green-verified.json)/[日志](release-game-guard-ui-r1-green-verified.txt)：320×568 努力 cancel false、390×700 努力 reload false、320×568 花预览 cancel+reload false 均保留操作。原世界与 XP0/BP30 不变；retry 写候选字节与失败时完全一致，努力只一次 50XP/10BP、生态一步，正确奖励反馈；建造只扣 2BP、预览位置保留、成功后选中新 o-7。

[兼容验证](release-game-guard-ui-r1-compat.json)/[日志](release-game-guard-ui-r1-compat.txt)：上述三场景加普通 quota 取消与串行旧 token conflict 重读共四场景通过。普通 quota cancel 清理 pending、原记录不变；恢复后新 10 分钟提交成功；另一旧 token 页 25 分钟冲突保持 XP0，不提供 retry，重读恢复赢家 10XP/32BP且关闭旧抽屉。这里是串行旧 token 场景，不替代独立 QA 的原生同时竞争测试。

[生产 preview5190](release-game-guard-ui-r1-production.json)/[日志](release-game-guard-ui-r1-production.txt) 同四场景全部通过；独立新 build 包含 checkpoint 模块，非 data harness。桌面/完整游戏闭环没有重复跑，本轮仅验证必要 guard 条件与兼容路径。

## Fresh checks / 冻结

- `npm test`：180/180、0 fail/skip，[完整日志](release-game-guard-ui-r1-npm-test.txt)。
- `npm run build:game`：成功，新 JS `index-BzzhrQBT.js` 248.39kB；[完整日志](release-game-guard-ui-r1-build.txt)。
- `git diff --check -- src/growth/game/GameApp.jsx`：退出 0。
- [冻结与构建 hashes](release-game-guard-ui-r1-hashes.json)：与上一 UI freeze 比较只有 GameApp 变化，另外四 UI 与集成测试五文件逐字节一致；数据模块仅只读记录 owner 当前 SHA，未修改；生产 bundle 包含 checkpoint DB 标识。

实际浏览器 Chrome155.0.8059.40；320/390 是隔离 Chrome 真触控事件的尺寸模拟，非硬件手机/Safari验证。故障注入 context 与原生并发 QA context 分开，未接触用户存档。原 r1-red/r1-green fixture 失败记录均保留。所有新证据为 release-game-guard-ui-*，未覆盖旧报告/证据；唯一源修改 GameApp。没有 Git、安装、新玩法或外部工具调用。

最终需 Manager 与只读 QA 基于新 GameApp SHA 复验、与 data owner 原生并发 guard 的结果合并判定 A11；本 Builder 不替代该结论，现已再次冻结。
