# QA-DATAUI-002 第1轮数据修复报告

状态：review，等待Manager统一最终测试/构建和独立QA复验；本Agent不自行关闭P1。修复计数1/3。依据Manager批准的[小型guard执行计划](concurrency-fix-plan.md)与[原生根因](concurrency-investigation/root-cause.md)。业务唯一写入persistence.js、新checkpoint.js，测试game-persistence/game-checkpoint；useGameWorld.js未改，UI归原UI Owner，主记录/Git归Manager。无新增依赖、世界迁移、权限申请、派工或Git操作。

## 改动与完整故障顺序

正式world仍为localStorage `mingrifu-growth-game-v1`、schemaVersion1、原JSON token；P1/V3/V4不读写。新增原生IDB `mingrifu-growth-game-v1-checkpoint`/version1/store checkpoint/key world，仅一个schema1小型元数据记录：digest、revision、previousDigest、previousRevision、owner。digest为原JSON文本UTF-8的SHA256，owner为每service稳定随机nonce；不存world或事件，不复制原文。既有合法LS记录在首次写bootstrap摘要，load不改原文；未知/坏world仍先严格拒绝，不用guard掩盖非法存档。

1. WebLock内解析当前原文并核对token/revision，捕获同一个Storage供读写。
2. IDB readwrite事务比较expected digest/revision，原子预提交candidate摘要；必须transaction.oncomplete后才允许LS.setItem。request.success不构成提交。旧缓存即使误读旧token，IDB跨renderer CAS仍拒绝第二写者。
3. LS.setItem成功后直接返回已保存候选，没有后续可能失败的guard提交/await。Hook到此才publish新world/资源。
4. guard.open/CAS/commit失败：未调用LS写，旧raw/world原样；命令/candidate保留重试，无误报成功。
5. LS抛：依API原记录未改变；只CAS回滚本owner的metadata。如果metadata回滚成功，write_failed可普通重试/取消；回滚失败checkpoint_pending，旧LS/raw和可见world保留，readonly且只允许同owner/同candidate恢复。
6. checkpoint_pending设置内部persistent recoveryRequired。后续重试再遇锁/IDB错误也不能因error.code改变而取消/重读丢owner；cancel同步false/reload异步false并保持pending，只有实际提交成功或实际metadata rollback完成才解除。UI Owner已独立适配handler对bool返回的保留行为。
7. reload与初始种子冲突自动重读均先await内部verify再publish；公开read仍同步，Hook公共API保持。metadata与raw不一致、无IDB/crypto/locks或metadata损坏均明确只读，不降级、reset、expiry、清空guard或覆盖另一页。

预提交和LS之间崩溃会留下领先guard与有效旧LS记录：批准的策略为fail-closed只读、下载/重读说明，保留原文和metadata，不自动恢复任意写。不宣称提供跨两种存储的通用ACID事务、断电保障或大型journal；这是明确的故障边界。

## TDD与源码验证

| 实际命令/阶段 | 结果 | 新证据 |
| --- | --- | --- |
| game-persistence新安全RED | 原31通过，新6失败，含stale缓存双成功 | [service RED](concurrency-service-red.txt) |
| game-checkpoint首次RED | 8失败，原生适配缺失 | [checkpoint RED](concurrency-checkpoint-red.txt) |
| 初次双文件GREEN | 45/45 | [GREEN](concurrency-green-first.txt) |
| 初始冲突重读遗漏verify回归RED→GREEN | 精确失败后最小补verify，46/46 | [RED](concurrency-initial-verify-red.txt)、[GREEN](concurrency-green-final.txt) |
| pending取消/重读保护RED→GREEN | 精确失败后仅保护恢复凭据，46/46 | [RED](concurrency-pending-cancel-red.txt)、[GREEN](concurrency-green-pending.txt) |
| 连续锁/IDB失败恢复标记RED→GREEN | 39数据中1失败后保持sticky标记；新增成功rollback解除用例，47/47 | [RED](concurrency-recovery-sticky-red.txt)、[GREEN](concurrency-green-recovery.txt) |
| 最终文案对齐后 `node --test tests/game-checkpoint.test.mjs tests/game-persistence.test.mjs` | 47/47、0失败/跳过 | [冻结GREEN](concurrency-green-frozen.txt) |

本表是同QA-DATAUI-002第1轮实现中的TDD增量，不把每条新增测试或验证服务器重跑伪装为额外QA修复轮。Manager批准的普通实现细节不再次要求用户确认。

checkpoint测试使用外部MemoryIDB边界，真实生产adapter负责校验/事务：请求成功先于提交、事务abort丢弃workspace、overlap队列、nonce一致/不同、未知schema不重置、open拒绝可重试。服务测试用生产controller/service与共享原子guard边界，模拟两个renderer各自持有旧localStorage cache。后面的实际Chrome用真正IDB与真正Storage确认关键故障，不只相信fake。

## 真实游戏UI/原生浏览器

环境Chrome155.0.8059.40、Node24.16.0、React19.2.0、Vite6.4.2。测试启动实际GameApp于localhost:5194，使用私有临时cache避免并行Vite cache冲突；每场景新建隔离BrowserContext，没有读取用户正式档案。所有上下文/服务/浏览器结束后关闭。

实际命令：

```sh
GAME_GUARD_RUN_ID=r1 PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-003-data/concurrency-native-ui.mjs
```

重跑必须换新的run ID，不能覆盖r1。源码、[23场景JSON](concurrency-browser-r1.json)、[完整日志](concurrency-browser-r1.txt)及截图保留。

- 16组真实GameApp双标签竞争，B→A/A→B各8：API均原生，无Storage/getter/locks/IDB override；控制页一次预置seed，两页精确token相同；A先持同名真实锁，native query确认pending2后释放。每组恰好1成功、1拒绝；拒绝页仍0XP30BP；手动reload和成功页真实refresh后资源一致且仅一事件，不会双方revision1成功。guard只有schema metadata字段，旧键哨兵不变。
- 两页首次null世界：一致保存一栋赠屋/BP30/revision0；真实refresh后raw与guard元数据不变，未重新赠送。
- 三个独立故障context（明确有fault injection，与native竞争上下文分开）：真实IDB put请求success后abort整个guard事务、Quota写失败、LS失败且真实IDB delete请求success后abort rollback。均保留原world XP0/BP30与seed原文；恢复注入后same candidate/event重试，最终25XP35BP/revision1、仅一个事件，refresh继续存在。
- 缺IDB/crypto：明确readonly、原记录不变、努力按钮禁用。
- 模拟崩溃领先guard：valid旧raw仍保留、saved=false/readonly；下载文件和seed原文一致，重读不清除原metadata。

本脚本未额外统计console/request错误，不能据此报告“0所有浏览器错误”；结果包含实际UI/数据断言与源SHA。23场景全通过且16组无双成功。更完整生产preview、手机恢复控制、普通quota取消/串行冲突兼容由原UI Owner单独报告，独立QA仍需复验。

## 冻结与交付

最后只把checkpoint_pending文案改为“重试/下载，恢复前不能取消或重读”，符合真实bool保护；未改变逻辑/API，47项fresh通过。浏览器r1记录的persistence SHA对应此字符串修改前逻辑，checkpoint/hook及事务逻辑相同；Manager统一最终build取最终明确文案。UI Owner已获同步，不同时修改data。

本轮未另起最终全suite/build，以Manager最新指令避免多owner并行覆盖构建；原UI Owner已报告fresh180测试与生产preview恢复流程，不能用其口头结论替代Manager最终命令/QA。技术审核通过前仍review，不宣称整游戏或美术approved。

补充运行限制：所有参与写入的页必须运行带guard的此版本；旧预览页需重新加载，旧代码/DevTools直接写LS不遵循新CAS协议。guard mismatch会保护新版本不自动覆盖异常原文。无Safari/WebKit或物理手机、无正式权限管理UI/断电实验，故障注入清楚记录；大世界8MiB仍拒绝而不裁历史。
