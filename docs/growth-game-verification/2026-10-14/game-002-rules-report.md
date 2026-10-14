# GAME-002 纯规则交付报告

日期：2026-10-14；负责人：原生 Builder `/root/game_rules`；当前交付状态：review，等待独立 QA 与 Manager 审核。美术与初始构图保持 candidate；本报告不构成用户视觉验收。

## 范围与验收

唯一写入：`src/growth/game/balance.js`、`world.js`、`spatial.js`、`tests/game-world.test.mjs`、本报告及 `game-002-rules-*.txt` 日志。Manager 独占主记录与 Git；UI Builder 独占渲染/入口/交互。未改 V3、P1、homestead、资产 PNG/工程或正式存档，未安装依赖、启动子 Agent、提交或推送。

依据：AGENTS.md、growth-product-spec.md、growth-development-plan.md、growth-game.md、task-game-002.md。复用 P1 纯命令、完整占地、连通区块、收纳校验的思路；新模块不依赖旧 2:1 投影。仅读取 manifest 的素材 ID、名称与占地摘要，不把 Sprite 画布尺寸当碰撞占地。

已实现：A02/A03/A05 的纯规则部分；32px 方格与 8×8 初始土地；XP0/BP30、赠送木屋、保护自然生长用的门前道路、有限自然环境；首次人工创建扣费；移动/收纳/重摆保 ID 且免费；非法命令或溢出原子拒绝；合法确认后才删除全部相交自然对象。预览不改资源、ID、revision 或植物。同位置移动返回原世界，其他有效变化 revision+1。

未实现：effort/expand 命令、奖励幂等和生态变化、存储、渲染/alpha 命中、手机/桌面 UI。effort/expand 当前抛明确“暂不可用”；后续 GAME-003/004 扩展。本次没有用假入口宣称完成后续能力。

## 稳定 API

| 模块 | 导出与契约 |
| --- | --- |
| balance.js | `BALANCE`：深冻结集中配置；`ASSETS`：素材 ID 为键，值 `{id,name,cost,footprint:[w,h],unlockXP}`；`stageForXP(xp)`：`{id,name,unlockXP,nextXP,xp}`，阶段名萌芽/扎根/丰茂，阈值 0/120/300，顶级 nextXP=null |
| world.js | `createGameWorld()`：每次独立复制种子；`applyGameCommand(world,command)`：纯函数，返回有效候选世界，非法中文 throw 且原输入不变；`validateGameWorld(world)`：返回原输入或中文 throw，不清理/重置 |
| spatial.js | `footprintCells(assetId,x,y)`：完整地面占地坐标；`hasWorldCell(world,x,y)`：负坐标用 floor 映射区块；`frontierChunks(world)`：去重、按 y/x 排序的四向候选；`placementCheck(world,assetId,x,y,ignoreId=null)`：`{ok,message}`，只判空间，不判价格与锁定；`cellKey(x,y)`：空间键 |

命令格式：`{type:'build',assetId,x,y}`、`{type:'move',id,x,y}`、`{type:'store',id}`、`{type:'place',id,x,y}`。build 创建新对象 ID；move 只用于地图上对象；place 只用于收纳对象；store 不退款。拥有对象移动/重摆不重新检查目录 XP 锁定。人工可以覆盖地形道路；自然占地始终禁止与道路、人工或其他自然重叠。

world 字段为 `{schemaVersion,revision,nextId,chunks,xp,bp,efforts,objects,nature,path}`。schemaVersion=1；初始 revision=0/nextId=7。人工 `{id:'o-1',asset:'cabin-terracotta',x:2,y:2,stored:false}`；收纳 x/y=null。自然 `{id:'n-2',asset:'oak-broad',x:0,y:2,stage:'mature'}`；各阶段素材映射在 ecology.stages 中。自然与人工共用递增整数后缀，不允许数字后缀碰撞，nextId 高于所有现存后缀；未来升级自然保原 ID。

初始自然：n-2 阔冠树(0,2) mature、n-3 青杉(6,3) mature、n-4 草(0,6) young、n-5 草(6,6) young、n-6 野花(2,5) static；道路(3,4..7)。初始高阶段自然不影响目录解锁。该接口已直接发送给 Manager 和 UI Builder，Manager 已通过字段形式与资源校验方案。

## 存档可信校验与技术上限

校验所有必需字段与未知字段、非负安全整数 XP/BP/revision、nextId、原点区块与四向连通、无重复区块、已知素材、全占地在开放土地内、人工占地不重叠、收纳坐标为空、自然阶段/素材相符及占地不压人工/道路/自然、事件必需内容/唯一 ID/分钟范围/真实 ISO 日历日期。

XP 必须等于所有有效 efforts 的分钟奖励总和。BP 必须非负且不超过初始 BP 加事件奖励；按 Manager 决策，本 MVP 不引入第二套花费账本。该检查拒绝凭空增加的 BP，但不证明历史花费明细，也不提供防篡改认证。

集中上限：区块坐标每轴绝对值≤64；最多 256 区块、4096 人工对象、16384 自然对象、16384 道路格、10000 努力事件；事件 ID≤120 字符、label≤80 字符。先检查数组长度，再遍历，避免无界列表；地图按稀疏区块集合验证，不按极端坐标建立巨大矩形。超过上限明确拒绝，不删除历史，不破坏事件去重。人工 ID 解析为安全整数且全局后缀唯一；分配与 revision 即将溢出时操作拒绝。

ISO 接受带秒的标准扩展格式 `YYYY-MM-DDTHH:mm:ss(.fraction)?(Z|±HH:mm)`，拒绝无时区、不合法日历日期或无法解析时间。存储模块后续还需在 JSON 解析前限制原始文本大小，单靠规则校验不控制解析超大字符串的成本。

## 真实验证证据

运行环境：本机 Node v24.16.0，Vite6.4.2，无新增依赖。

1. 先写 26 项需求测试，在新模块尚不存在时运行 `node --test tests/game-world.test.mjs`，退出 1；[初始 RED](game-002-rules-red.txt) 精确记录模块缺失，不把该导入失败冒充全部行为失败。
2. 最小种子/配置/空间 API 已可运行后，再运行同命令，6 通过、20 失败、退出 1；[行为 RED](game-002-rules-behavior-red.txt) 包含未支持合法建花/免费生命周期，以及坏档未拒绝的真实失败。
3. 实现命令与严格语义校验后，同命令 26/26 通过、0 失败、0 跳过、退出 0；[首轮 GREEN](game-002-rules-attempt-1.txt)。未改已验收实现以制造红绿历史；没有失败后覆盖旧日志。
4. `npm test`：81/81 通过、0 失败/跳过、退出 0；[全项目测试](game-002-rules-npm-test.txt)。包含原有 52 项、GAME-001 的 3 项构建/HTTP 测试和新规则 26 项。
5. `npm run build:game -- --outDir /tmp/mingrifu-game-002-rules-build.r0KsPe --emptyOutDir`：33 模块，独立临时输出构建成功、退出 0；[构建日志](game-002-rules-build.txt)。这是本次运行时 GAME-001 页面与原资源的构建回归；规则尚未由 UI 引入，不能据此声称新建造 UI 已集成或已完成最终 GAME-002 构建。

用例覆盖：素材清单映射/价格；阶段精确阈值；新世界独立种子；全占地；四向/负坐标/跨接缝；只读预览；花扣费与 ID；自然完整占地退让；锁定/费用不足/越界/人工重叠/非法坐标；免费 gift 和已拥有锁定素材移动/收纳/重摆；无操作 revision；生命周期误用；ID/revision 溢出；坏字段/资源/区块/ID/占地/自然/道路/事件；大数组边界；坏原世界先拒绝。

## 未验证与后续

本子任务是纯规则实现，没有访问浏览器 localStorage 或用户存档。桌面/320/390px 操作、alpha 前景命中、拖动与确认同屏、渲染遮挡及视觉质量由 UI Builder 与独立 QA 在集成后验证；本报告不引用 GAME-001 浏览器截图来代替新建造流程证据。真实手机/Safari 也未验证。

等待 QA 与 Manager 审核。进入 GAME-004 与 expand 纯命令须由 Manager 明确继续派工；当前不自行扩展文件域或开始下一阶段。后续 persistence 必须使用独立键 `mingrifu-growth-game-v1`、Web Locks、先成功存储再发布候选世界；当前规则不负责存储，也不宣称并发写安全已经实现。
