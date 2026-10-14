# QA-DATAUI-002 原生并发根因调查

状态：只读调查完成，生产修复0轮。根因计划已送Manager，未改业务/测试文件，未写QA路径。当前分支feature/growth-rebuild、HEAD a9ca5d093bb1051baeed561c20c6040c953ebd29；persistence SHA256 `5358530f9fc3d723521c9f2376b51431dbba06e379636d58bf5eac5db9d4087e`、GameApp `fc3ec93af4364068187b06ee91c16de080f7b77d3d50059b340087dd3447b226`。

## 独立原生证据

QA原始干净脚本/JSON只读参考位于`/tmp/mingrifu-dataui-qa.u6Ge35/native-two-tabs-clean.mjs`、`native-clean-races.json`，第0次真实产品两页均UI保存成功，B刷新丢25分钟事件。控制页仅预置一次seed，排除了两个初始fixture写入。

本独立实验全部新建Chrome155.0.8059.40隔离BrowserContext、同来源http://127.0.0.1:5189，控制页一次预置原游戏key/world，A/B精确初始token相等，A持原锁名`mingrifu-growth-game-v1:save`，B先排队/A后排队，native query确认pending=2后释放。Storage/getter/locks均没有override，getItem/setItem/request实际native函数；probe只加本测试DOM按钮、storage事件监听、时间日志，不修改业务。

| 实验 | 样本 | 双成功丢一事件 | 证据 |
| --- | ---: | ---: | --- |
| 空白同源页面，实际生产service | 12 | 0 | [r1 JSON](native-visibility-r1.json)、[r1脚本](native-visibility.mjs) |
| 空白同源页面，直接原生锁/Storage协议 | 12 | 0 | 同上 |
| 实际游戏UI背景，真实用户按钮触发实际生产service | 12 | 2（index7/9） | [r2 JSON](native-visibility-r2.json)、[r2脚本](native-visibility-ui.mjs)、[日志](native-visibility-r2.txt) |
| 实际游戏UI背景，真实按钮触发直接原生锁/Storage协议 | 12 | 3（index1/2/9） | 同上 |

空白页正常不能反证UI调度窗口；本次并不以样本通过率代替原子性要求。

native-protocol/index1发生顺序（时间为performance.timeOrigin+performance.now，单位ms）：

1. B取得唯一独占锁，锁内getItem读XP0，`1791990360505.5`。
2. B setItem25返回，其本地getItem25，随后请求Promise成功，`...505.6`。
3. A后续取得同名独占锁，锁内getItem仍XP0，`...505.8`。
4. A setItem10返回并成功，`...505.8`。
5. A收到B的原生storage事件25，`...506`，当时native getItem已经XP10。
6. 新打开独立页面读最终记录XP10；B已宣称的25分钟事件被覆盖。

index2/index9具有同类严格顺序；实际生产service/index7/index9双方返回ok=true而fresh读取XP10。锁callback不重叠、锁名/来源一致，实际业务token判定读取的是未更新的本地缓存。

## 根因与主来源

根因是当前协议假设“取得Web Lock后getItem必然看见上一锁拥有者的setItem”，此假设在实际Chrome跨renderer/UI调度中不成立；即使同步代码读-校验-写完全串行，缓存token仍可过期，因此两个revision1写入都通过。没有证据指向世界命令幂等、Hook忙锁或初始fixture重复写入。

[HTML WebStorage规范](https://html.spec.whatwg.org/multipage/webstorage.html#introduction)没有定义多进程不同agent clusters间的互动，并把跨页storage通知排入任务。Chromium当前[StorageArea实现](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/storage/storage_area.cc)的getItem委派CachedStorageArea，通知加入DOMManipulation任务；官方[CachedStorageArea源码记录](https://chromium.googlesource.com/chromium/src/+/fc2f25945c9bae30b9bae672ae4b7c648bacf322/third_party/blink/renderer/modules/storage/cached_storage_area.cc)显示本地map与异步observer更新路径。这些源码是机制支持，不冒称匹配已安装Chrome155的确切构建源码。

[Web Locks规范](https://w3c.github.io/web-locks/#locks)保证同名exclusive调度和callback完成后释放；它的资源名仅为应用抽象资源。本实测证明锁调度成立，未把跨API缓存更新当成额外保证。等待任意毫秒、广播消息或多读几次不能建立持久化事务边界，故未使用盲延时方案。

## 送Manager的最小方案（尚未实现）

原localStorage key/schema/world保持唯一正式记录，不迁移到IDB。IDB仅存单条小型checkpoint摘要（SHA256原文、revision、上一摘要/revision、owner随机标记），作为跨renderer原子fence。

锁内先校验当前原文/revision，再IDB事务比较expected摘要并预提交candidate摘要；必须oncomplete确认后才调用localStorage.setItem。这样guard失败时world/raw从未被触碰；setItem成功后不再进行可能失败的额外guard提交，直接返回成功。第二客户端即使localStorage缓存仍旧，也会被已经更新的原子checkpoint拒绝。

setItem抛时保持旧raw，CAS回滚metadata；metadata回滚失败也不改world/raw，明确只读，保留同pending，只有原owner同candidate可受控重试。加载在发布世界前异步核对摘要；guard缺能力/异常不降级。有效旧档首次写可在同锁内bootstrap摘要，不修改原文；坏档/未知版本仍原值只读。

预提交和setItem之间页面崩溃可能留下“有效旧raw+超前摘要”，必须fail-closed只读并明确恢复说明，不自动重置checkpoint。纯小摘要不能安全区分这个状态和跨renderer缓存尚旧；若要求该崩溃情形也自动可写，需另议恢复机制或journal，不能偷偷改成IDB权威世界存储。以上取舍待Manager确认后执行第1轮TDD/原生双页复验。
