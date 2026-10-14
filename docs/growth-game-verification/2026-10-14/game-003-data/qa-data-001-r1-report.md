# QA-DATA-001 第1轮修复

状态：review，等待独立QA复验。缺陷来源为Manager确认的QA-DATA-001/P2，修复计数1/3；本报告不自行关闭QA缺陷。开始分支`feature/growth-rebuild`、HEAD`465ff6b918ac558f35f8bbd4fa2b831480f4bbf9`。唯一源码变更`src/growth/game/persistence.js`，新增回归在`tests/game-persistence.test.mjs`；`useGameWorld.js`未改，UI/world/主记录/Git未写。原始 [数据报告](report.md)、r1浏览器及RED/GREEN全部保留，没有覆盖。

## 根因与最小修复

创建默认service时，`globalThis.localStorage` getter首次抛的SecurityError被永久缓存到storageError；之后read只重抛该对象，即使当前getter已经返回有效存储。原“检查存储权限后重新读取”无法兑现。

默认浏览器Storage现在由`currentStorage()`在每次read和每次锁内事务重新获取。显式注入storage仍只获取一次，不受后续options或ambient getter变化影响。读取分为公开read与内部readFrom；save锁内固定一次取得的writeStorage，readFrom与setItem使用同一对象，避免读A/写B。JSON/token/revision/Web Locks/schema/费用/幂等规则没有变化，Hook稳定API没有变化。

## 真实回归与验证

| 命令/场景 | 结果 | 新证据 |
| --- | --- | --- |
| `node --test tests/game-persistence.test.mjs`，修复前 | 30通过/1失败：外部getter已恢复可读，同controller.reload仍false | [RED](qa-data-001-r1-red.txt) |
| 同命令，修复后 | 31/31通过，0失败/跳过 | [GREEN](qa-data-001-r1-green.txt) |
| `npm test` | 当前全套158/158，0失败/跳过 | [全套](qa-data-001-r1-npm-test.txt) |
| `npm run build:game` | 成功 | [独立构建](qa-data-001-r1-build.txt) |
| 隔离Chrome155桌面/320/390，真实React19 StrictMode Hook与localStorage | 3恢复/保存流程通过，0 page/console error | [第二轮JSON](qa-data-001-browser-r2.json)、[日志](qa-data-001-browser-r2.txt)、[可复验脚本](browser-qa-data-001-r2.mjs) |

新增4个Node回归：同controller默认getter拒绝→恢复，完整旧world/XP25/BP33/ID/已收纳木屋/努力与带空白原文全部恢复，saved=true、解除fault/readonly、恢复写入0；持续getter拒绝多次reload仍只读且零写；显式注入固定Storage不受options/global变化；在锁内read之后getter切换对象时，save只写已经校验token的原对象。已有双页竞争、损坏/无锁、Quota/同candidate retry等27项均通过。

浏览器是故障注入：保存合法旧world后，给同一页面的localStorage getter加临时拒绝开关。相同React Hook先fault；继续拒绝时重新读取仍fault且0写；关闭注入开关后实际localStorage可读，点击/手机tap“重新读取”，无需remount便恢复完整原档。恢复前后reload函数身份相同、world revision3、XP25/BP33、原文完全一致、0写（没有重送木屋）。之后记录10分钟模拟努力，真实save成功1次，revision4、XP35/BP35、两个事件ID完整保留，原人工ID/收纳状态不变。旧P1/V3/V4哨兵不变；所有上下文/浏览器/专属服务结束后关闭。未更改真实浏览器权限或用户正式存档。

已查看 [320px恢复状态](qa-data-001-browser-r2-phone320-recovered.png)，仅数据诊断harness，不代替产品界面或美术验收。

## 验证服务器失败记录

首轮专属端口服务使用默认Vite依赖缓存，和并行dev/测试共用`node_modules/.vite`；两条504 Outdated Optimize Dep让React模块未加载，probe等Hook超时。原失败 [JSON](qa-data-001-browser-r1.json)、[日志](qa-data-001-browser-r1.txt)、[脚本](browser-qa-data-001.mjs)、截图均保留。没有再次修改业务。

第二轮新脚本只给测试server使用`mkdtemp`独立cacheDir，3流程通过；日志记录临时路径。Vite/Babel对临时ReactDOM优化文件出现500KB样式deoptimised提示，不是browser error，实际浏览器0 page/console error。重跑请使用新的run ID，不能覆盖r2：

```sh
GAME_DATA_RUN_ID=new-id PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-003-data/browser-qa-data-001-r2.mjs
```

## 范围与限制

默认save路径的Storage获取位置有改动，已用“锁内读写相同对象”Node回归与恢复后真实Chrome保存验证；Web Locks/token/revision协议未改变。无hook/公开API变化、无新依赖、无Git操作。新证据均`qa-data-001-*`或`browser-qa-data-001*`命名，未覆盖旧日志。源码均尚未被Manager纳入Git，因此`git diff --no-index --check /dev/null <file>`退出1表示存在新增文件差异，3源码/测试检查没有空白问题诊断。

本轮未验证Safari/WebKit、真机或操作浏览器真实权限管理UI；Chrome测试明确是getter拒绝的故障注入及原生Storage恢复。完整游戏UI接入、产品全闭环与QA最终判定仍由Manager安排，缺陷仍等待QA复验后关闭。
