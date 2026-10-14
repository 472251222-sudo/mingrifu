# GAME-003 数据基础报告

状态：review，等待 Manager / 独立 QA；不宣称 GAME-003 整阶段完成。实际开始分支 `feature/growth-rebuild`、HEAD `12c8310fb170799d5f10752dca1823b79db095e7`。依据 [任务](../task-game-003-004.md)、[正式规格](../../../growth-product-spec.md)及 Manager 有界派工。唯一写入业务范围为 `src/growth/game/persistence.js`、`useGameWorld.js` 和 `tests/game-persistence.test.mjs`，证据仅本新目录。未提交、推送、安装依赖、派子 Agent、修改规则/UI/V3/P1/素材或读取正式浏览器档案。

## 交付与接口

- 独立键 `mingrifu-growth-game-v1`，schemaVersion=1。集中 `GAME_PERSISTENCE` 指定唯一锁名 `mingrifu-growth-game-v1:save`、8 MiB UTF-8 JSON 字节上限。读取严格 `validateGameWorld`；原文先限制大小，再解析，坏档/未知版本/禁止访问不清理、不覆盖、不导入、不迁移。
- `createGamePersistence({storage,locks})` 返回 `{readonly,read,save}`。`read()` 同步返回 `{world,token,isNew,raw}`；token 是精确原 JSON 文本或 null。`save(candidate,expectedToken)` 先复制并校验候选，再在同源独占 Web Lock 内读取、校验 token 与连续 revision、写入；返回同形结果。既有世界要求 revision+1，初始 null token 只允许 revision0；同 token 两客户端恰好一个成功。无锁只读，不降级为非原子写入。
- `createGameWorldController({persistence})` 实现实际事务，是 Hook 和 Node 测试的同一生产代码。`useGameWorld()` 返回 `{world,status,busy,readonly,error,pending,raw,saved,run,retry,cancel,reload}`。status 为 loading/ready/fault；方法 run/retry/reload 返回 Promise<boolean>，cancel 返回 boolean。
- 保存成功才发布可见 world/资源。pending 的 command/candidate 深冻结；失败旧世界不变，重试同候选、同事件 ID，不再次执行命令或生成奖励。pending 未取消/解决时不能接受另一个命令。冲突只可 reload，retry 被拒绝；cancel 也不能解除冲突的只读状态。
- 首次种子保存失败时 saved=false、status=fault、readonly=true，world 明确仅初始预览；pending.kind=initial 可重试。初始种子双页冲突自动采用已有那份存档，仅此情况自动读取。普通跨页操作冲突不自动覆盖。
- React 使用 useSyncExternalStore 订阅稳定 snapshot，controller 内同步 busy guard/token 不依赖渲染延迟；StrictMode 效果重放和重新 mount 不重复赠送。重复努力/原地移动返回成功 no-op，不写、不增 revision。

`error.code`：`readonly`、`storage_unavailable`、`invalid_json`、`unsupported_version`、`invalid_world`、`save_too_large`、`invalid_token`、`invalid_revision`、`conflict`、`write_failed`、`lock_failed`、`invalid_command`。raw 为 string/null，仅已经存在的存档原文；无权读取时为 null，拒绝的候选 JSON 不冒充原始存档。UI 可 `Blob([raw], {type:'application/json;charset=utf-8'})` 下载，保留原文本字符与换行，不能先解析后格式化。UI Builder 已收到接口；run/retry 返回 true 后可收起预览。

## 实测与证据

环境：Node v24.16.0 / npm 11.13.0 / React19.2.0 / Vite6.4.2 / Chrome155.0.8059.40，使用已存在的 Playwright。本次 Chrome 全部新建隔离上下文，测试只访问 localhost:5194 的本专属 harness；测试服务器/浏览器结束后关闭。

| 命令或真实场景 | 结果 | 证据 |
| --- | --- | --- |
| `node --test tests/game-persistence.test.mjs`，实现前 | 21 个契约断言失败，service/controller 缺失 | [真实 RED](service-red.txt) |
| 同命令，第一批实现后 | 21/21，0 失败 | [第一批 GREEN](service-green-first.txt) |
| 同命令，补充故障边界复现 | 25 通过、2 失败；见下节根因 | [边界 RED](fault-edge-red.txt) |
| 同命令，最终源码 | 27/27，0 失败、0 跳过 | [最终 GREEN](service-green-final.txt) |
| `npm test` | 当前全套155/155、0失败、0跳过 | [全套](npm-test.txt) |
| `npm run build:game` | 成功，39 modules，原12运行资源、独立游戏 bundle | [构建](build.txt) |
| 本目录 browser-harness.mjs，Chrome | 12 数据/Hook 场景通过，0 page/console error | [JSON](browser-r1.json)、[日志](browser-r1.txt)、[脚本](browser-harness.mjs) |
| 指定源码/测试 `git diff --check`，V3/P1/homestead diff 核对 | 退出0；这些受保护已跟踪路径无差异 | 本轮实际工具输出 |

Node 测试实际使用纯规则、真实 controller/service、fake Storage 外部边界和排队 exclusive locks。覆盖刷新、原文 token（含仅格式变化）、initial/revision、同步双客户端、无锁、localStorage getter/read 拒绝、锁取得拒绝、Quota 失败、失败新用户、重试/取消、同努力 ID50XP+10BP仅一次、深冻结、旧键哨兵、UTF-8 原文/合法候选超8MiB。不是复制 UI 算法或以 mock 断言替代业务。

Chrome harness 使用真实 React StrictMode / Hook / Web Locks / localStorage：桌面建野花30→28、努力失败旧XP/BP不变及同ID重试、刷新保留；外部先持有真正同源锁，让两个页面同步排队，结果一个成功、一个 conflict，后者需 reload；坏JSON/未知版本/非法世界原文下载文件逐字符一致；无锁新/旧世界只读；storage getter拒绝；初始Quota失败再重试只送一栋木屋；320/390px通过真实 touchscreen.tap建造/努力/刷新。所有可读场景旧P1/V3/V4哨兵保持不变。Node覆盖同步null-token种子竞争；Chrome的初始两页场景验证先后进入采用同一存档、总种子写1次，不将它冒称同步null-token竞争。

浏览器重跑必须使用新的 GAME_DATA_RUN_ID，避免覆盖r1证据：

```sh
GAME_DATA_RUN_ID=new-id PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-003-data/browser-harness.mjs
```

已人工打开检查 [320 数据状态](browser-r1-phone-320-touch-persistence.png)、[坏档只读状态](browser-r1-bad-json.png)。截图为诊断 harness，不是产品界面；数据输出在320px可横向延伸，不能据此声称真实游戏手机布局或美术通过。

## 失败记录与根因修复

两个自查边界问题各执行1轮最小修复，无未解决缺陷；原 RED 保留。

1. 模拟 request 属性 getter 拒绝稳定抛出 SecurityError。根因：navigator.locks getter已在try内，但后续 `typeof locks.request` 能力读取在try外。仅把能力检测移入try；getter拒绝显式readonly。单项 [复验](lock-getter-green.txt) 通过，最终全套通过。
2. 合法超大候选（最大历史/对象/自然列表）得到 save_too_large，但错误raw携候选JSON，可能让UI下载未保存内容。根因：读取parseWorld与候选parseWorld共用携raw错误，破坏raw的“已存原文”含义。只在候选解析错误边界清raw（controller继续持有已读旧raw），未改写存储；最终该故障用例及全套通过。

## 未验证与阶段限制

本任务只交付数据基础。GameApp尚需UI Builder按Manager调度接入Hook，游戏努力/建造/扩张/收纳的真实产品全闭环、dev/production preview故障界面、独立QA与产品/视觉确认仍待后续；本次普通独立构建成功不代表未接入Hook的产品事务已验收。浏览器验证是Chrome桌面/手机模拟，不包括Safari/WebKit或物理手机，不包括云备份/跨来源迁移。8MiB是明确拒绝上限，浏览器实际Quota可能更小，已覆盖Quota故障而不承诺容量。

文件清单：2源码+1测试、本目录report.md/browser-harness.mjs、8份txt日志、browser-r1.json与12张browser-r1-*.png。Manager维护主记录/Git；本Agent未写其他业务范围或主记录。必要构建产生忽略的dist/game和Vite缓存，不作为源码提交范围。
