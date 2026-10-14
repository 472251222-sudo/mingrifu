# GAME-004 成长与 GAME-003 扩张纯规则报告

日期：2026-10-14；负责人：原生 Builder `/root/game_rules`；状态：review，等待独立 QA 与 Manager 审核。此次技术验证不构成产品/美术批准。

## 范围与授权

依据 PRD A06/A07/A08/A09/A14、task-game-003-004.md 和 Manager 有界任务。唯一修改规则 `balance.js`、`world.js`、新增 `growth.js`，新增 `tests/game-growth.test.mjs`，本报告与 `game-004-rules-*.txt`。`spatial.js` 归本负责人但本轮无须改变。Manager 另行明确授权将原 `game-world.test.mjs` 的两条过时“effort/expand 暂不可用”断言改为坏 effort/锁定 expand 原子拒绝，并补真正 unknown command；其余原 26 项需求行为保留。

未修改 UI/renderer/scene/hook/persistence、V3/P1/旧素材/正式存档、共享主记录或 Git；未安装依赖、收费调用、派子 Agent、提交/推送。已向 UI Builder、数据 Builder、Manager 同步新增接口；各负责人保持独占文件域。

## 新命令与稳定接口

`applyGameCommand(world,{type:'effort',event:{id,source:'simulation',minutes,occurredAt,label?}})`：事件校验先于发奖，minutes 为 1..180 整数，XP=minutes，BP=floor(minutes/5)。每个新事件整体 revision+1；每次发奖与生态处理共用一份候选，失败不改原世界。事件复制保存，不与调用方请求对象共享可变记录。

同 ID、同字段值返回原 world 引用，XP/BP/revision/nature/nextId/efforts 全部不变；同 ID 不同内容明确拒绝。逐字段比较 id/source/minutes/occurredAt/label，不用对象键插入顺序或整对象 JSON 字符串判断内容。label 缺省与 undefined 均规范成无 label 保存，显式空字符串是另一内容。日期字符串保留，不同 occurredAt 即使可解析均按不同内容拒绝。重复事件即使发生在存档 JSON 恢复、BP 已花费、扩张或事件数量已满之后仍无操作；历史不删除、不裁剪。

`applyGameCommand(world,{type:'expand',x:chunkX,y:chunkY})`：需至少 120XP 与 20BP，只允许 `frontierChunks` 中四向相邻且未购买的合法区块。每块 8×8，原人工/自然/道路/努力坐标与记录完全保持；一次扣 20BP、一次 revision+1；支持负坐标与人工完整占地跨已开放接缝。非法坐标、超界、重复、跳地、对角、余额不足、锁定、区块容量或 revision 溢出都原子拒绝。

原 `ASSETS/BALANCE/stageForXP/createGameWorld/validateGameWorld/placementCheck/footprintCells/hasWorldCell/frontierChunks` 契约保留。world 仍严格使用原 10 个字段与 schemaVersion=1，无新成长状态或 UI 反馈字段。growth.js 内部协作导出 `validateEffortEvent`、`sameEffortContent`、`growNatureForXP`；UI/数据层继续仅以 world 公共命令为状态变更入口。

## 确定性生态与保护

新增集中配置：生态 young→bush、bush→oak-broad mature 的素材/阶段转换，新增 grass-tuft young 的 seed；时间文本上限也移入 balance。每累计 50XP 触发一个步骤，处理步数为 `floor(nextXP/50)-floor(oldXP/50)`，一个 180 分钟事件最多跨 4 个边界。

每步按自然对象 y/x 坐标排序尝试升级一个对象：同 ID、同 x/y，完整新占地必须在已开放土地，不与人工、道路或其他自然占地相交。灌木的 2×2 阔冠树升级受阻时继续下一候选；成熟树与静态野花不再升级。没有可升级对象时，按全部已开放格子的 y/x 顺序找到第一个合法空位，添一株 young 草并分配安全的新 n-ID；不依赖 eventId、随机值、时间或原数组顺序。

新增与升级都不花 BP，不移动/收纳/更改任何人工记录，包括人工树、草、花及已收纳对象；道路坐标和地形不改变。自然树冠的正常视觉遮挡由渲染层处理，规则仅管理实际占地，不为了避免树冠移动其他对象。

无空地且无合法升级时，该步骤自然不变化，但完整发放当前事件 XP/BP。已跨边界通过永久 XP 消耗，不形成延后生态欠账：扩地、渲染或重试旧事件不会补发旧变化。专项连续流程覆盖拥挤 180XP（三个无变化步）→西扩→重试旧事件无操作→181XP仍无植物→200XP只添一株。

## UI 反馈约定

UI 可先计算跨过的 50XP 边界数，再比较 before/after 自然新增 ID 与 asset 改变。跨边界且自然完全不变时明确显示“空间不足，本次自然未变化，努力仍已积累”；部分有变化显示最终改变的植物数量。一个植物在同事件中可能连升两级，因此最终对象差不能冒称精确步骤数。该约定已同步 UI Builder，world 不存另一份成长阶段/计数，防止双源不一致。

阶段始终由永久 XP 推导，120/300 到达时目录规则立即开放。花 BP、移动、收纳、重摆、扩张均不减少 XP。occurredAt 仅是事件内容，既不自动发奖也不因距离当前日期久远而衰退；没有签到、维护或离线时钟逻辑。

## 校验与限额

命令和存档复用同一个事件内容校验器，合法新事件能重新通过存档语义校验。继续要求 XP 等于全历史努力分钟奖励之和，BP 非负且不超过初始加发奖总额；沿用已通过的语义/占地/ID/连通地图检查，无花费账本。

沿用 balance 集中上限（256 区块、每轴区块坐标±64、10000 事件等）。新事件达到容量时明确拒绝且原历史保留；重复已有事件仍允许无操作。新植物确需分配 ID 时遇安全整数上限拒绝整项事件；只升级已有对象不占用新 ID。revision 溢出拒绝整项命令。XP/BP 求和也显式检查安全整数；有效历史的数量/单事件范围实际上将 XP 限在 1,800,000 以下、发出的 BP 限在 360,030 以下，不能构造合法存档在本配置下接近 JS 安全整数上限。

自然扫描只生成已开放格子（最多 16,384 格），不按负坐标和远区块包围盒分配巨大矩形。状态算法只由经校验的公共命令调用；未增加任意存档导入或旧数据迁移。

## 真实 RED / GREEN 与回归

本机 Node v24.16.0，沿用既有依赖，无安装。原始日志保留；没有覆盖 GAME-002 或其他 Agent 证据。

1. 实现前 `node --test tests/game-growth.test.mjs`：34 项行为测试、0 通过、34 失败、退出 1；[RED](game-004-rules-red.txt)。所有导入已存在，失败明确来自公共命令尚不支持 effort/expand，不是导入缺失或语法错误。
2. 实现后 `node --test tests/game-growth.test.mjs tests/game-world.test.mjs`：34 新项+26 原项，共 60/60，通过、0 失败/跳过、退出 0；[首轮 GREEN](game-004-rules-attempt-1.txt)。无需修复失败实现轮次。
3. 增加“拥挤生态解除后不补旧变化”的连续流程保证测试（这是 GREEN 后补充验证，不宣称其有实现前 RED）；重跑同命令，35 新项+26 原项，共 61/61，通过、退出 0；[最终规则 GREEN](game-004-rules-green.txt)。
4. 首次 `npm test`：148/148，通过、退出 0；[首次回归](game-004-rules-npm-test.txt)。补充连续流程后重跑 `npm test`：149/149，通过、0 失败/跳过、退出 0；[最终回归](game-004-rules-npm-test-final.txt)。本轮记录同时覆盖其他 Agent 当时已存在的持久化与视图测试，以及原 52 项，未把它们当成本负责人实现。

35 项新用例包括：10/25/50 与边界 1/3/180 奖励；日期/分钟/source/id/label/未知字段；事件去重及不同内容冲突；事件快照；每事件 BP 下取整；单/多 50XP 边界；四类升级阻挡换候选；阻挡后添草、成熟/静态不升级、确定性；拥挤发奖与无欠账；长期人工/道路保护；120/300 解锁和 BP 消费不降 XP；时钟不发奖/衰退；历史容量与同 ID 无操作；ID/revision 溢出；四向64格扩张；锁定/费用/坐标/邻接/重复；负坐标接缝建造与新地生长；地图容量/边界；schema不变与全历史恢复幂等。

## 未覆盖与下一步

最终独立构建与桌面/320/390px 成长/扩张/保存全流程由 UI、数据负责人集成后统一执行。本轮 `npm test` 包含独立构建/HTTP 契约测试成功，但不把它当最终 UI 反馈或浏览器流程完成。真实手机/Safari、美术遮挡质量、用户视觉批准未验证。

目前只负责候选纯状态，不写 localStorage 或发布 UI 状态。持久化先写成功再发布、Web Locks 并发、失败同 ID 重试仍由数据层负责；规则幂等与原子候选为其提供基础，不能代替浏览器竞争验证。等待独立 QA 与 Manager 审核/下一派工，不自行扩大范围。
