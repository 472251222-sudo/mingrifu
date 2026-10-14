# 明日复独立成长游戏：Manager接管记录

更新：2026-10-14。本文件是长期目标、当前状态与任务队列的唯一汇总；阶段产物、截图和详细证据继续保留在原目录，不复制一套美术/测试文档。先核对实际Git状态，再用本文件恢复上下文。

## 目标与边界

交付可独立运行、可以实际体验的成长游戏模块，再考虑并入明日复。持续世界代表用户本人，不从属于单个目标；允许自由建造、布置和扩张，未来现实努力推动成长。当前不接主产品任务数据、正式奖励或经济体系，不新增账号、云同步或引擎迁移。

已确认技术/美术方向：React+Canvas、2D正交方形地面、32×32瓦片、3/4视角像素Sprite、最近邻缩放、统一光照。免费Blender自动建模/渲染为主要对象生产路线，地形采用原创像素设计与连接规则。禁止PixelLab与收费生成；保留研究成果作历史资料。

陶土红木屋是已验收基准，不重新设计。依据是用户2026-10-14 P2-B任务明确写明“用户已经认可当前木屋美术品质”；深蓝版仅保留作变体。新增树木、植被、地形、装饰与家园整体构图待用户视觉验收。商业游戏仅为品质参考，不复制素材。

## 当前仓库与架构

- 本轮开始：feature/growth-rebuild，HEAD `65774ef568ca467f0cae530702e8f7d87dde0b4c`（P1.1 baseline），跟踪origin同名分支。
- 本地main与远程main：`990f7ff11718a0131ca1b96f34fbc049317ad95d`。本地v4-development：`44d16da`；本轮远程查询没有同名分支。历史checkout仍保留，不修改。
- P1/P1.1已入Git。P2-A、P2-B、PixelLab资料及作品集等仍有既有未跟踪文件；`src/main.jsx`已有未提交P2-B入口。**本次配置提交不包含这些成果，远程/新clone不能仅凭配置提交恢复本地P2-B。** 后续先独立审查并归档有效成果，不能删除或假装已提交。
- 技术栈：React19.2、Vite6.4、ES modules、CSS、Canvas2D；项目npm依赖已在本地。`npm test`使用Node内置测试；`npm run build`走Vite及Sites包装，仍是包含V3的整体应用构建，尚非独立游戏包。
- `src/main.jsx`以懒加载路径隔离`/growth-p1`和`/growth-p2-homestead`，其他路径仍为V3 App。P2-B现在可独立访问，但仍借用主仓库入口与构建，**未达到独立发行模块**。

## 实际成果与验收状态

| 能力/方案 | 实际状态 | 依据与边界 |
| --- | --- | --- |
| P1/P1.1自由建造 | 已开发、技术验证通过；未找到完整人工产品验收记录 | [P1](growth-p1/README.md)、[P1.1](growth-p1.1/README.md)；放置/合法性/移动/收纳/重摆、模拟环境成长、8×8区块扩张、手机抽屉、相机与alpha命中 |
| P1持久化 | 已开发、原型技术验证通过 | `src/growth/world.js`、`persistence.js`、`useWorld.js`；localStorage `mingrifu-growth-world-p1-v1`，保存失败/损坏/跨标签冲突保护。不是账号/云同步，也不是新正交游戏存档方案 |
| P1.1旧菱形美术样板 | 已开发；该投影已被后续产品决策替代 | `view.js`仍使用2:1投影，旧Canvas程序美术与原型保持可运行，不能当新正交模块的最终美术 |
| Blender木屋P2-A | 已开发，陶土红木屋已获用户视觉确认 | [原报告](growth-blender-experiment/2026-10-13/README.md)，有效工程在`delivery/`。96×128透明PNG、候选32色、相机南侧0°水平旋转/38°俯角；屋顶可独立换色；原报告旧“待验收”文字按历史保留 |
| P2-B林缘小家 | 已开发，技术/候选美术完成；新增美术与构图未验收 | [报告](growth-p2-b/2026-10-14/README.md)、[资源清单](growth-p2-b/2026-10-14/ASSET-CATALOG.md)、`src/growth/homestead/`；12×12Tilemap、32对象实例、10Sprite（9新增）、104地形图块；木屋原图字节未变 |
| P2-B相机与渲染 | 已开发，Chrome桌面与320/390px模拟验证通过 | 锚点排序、像素缩放、拖动/总览、资源加载失败重试；真实手机/Safari、双指缩放、长期大地图性能尚未验证 |
| P2-B建造/存档 | 尚未开发 | 目前只读场景配置+预览，没有新场景自由放置/移动/收纳、世界扩张或保存。不能把P1能力视为已经接入P2-B |
| 独立游戏入口/发行包 | 尚未开发 | 当前路由依附V3入口；独立启动、构建/预览与资源工程打包须下一阶段实现 |
| 正交游戏成长反馈、正式玩法/经济 | 尚未开发/部分产品规则待定 | P1只有模拟成长；保留世界独立方向，不继承旧V3目标绑定机制 |
| 通用AI图像/PixelLab/Pixelorama实验 | 通用生成与PixelLab实验已完成；Pixelorama仅研究，编辑实操未验证；当前路线停用 | `docs/growth-art-research/`、`growth-pixellab-workflow/`、`growth-pixellab-live/`。不得删除，不调用服务，不把历史接口能力当本轮使用 |
| V3旧成长、历史V4方案 | 旧实现保留；不作为新游戏产品约束 | 不删除、不重构业务、不迁移V4全系统；当前主产品仍按原方案运行 |

本轮完成多Agent配置接管（CFG-001），没有在开发游戏业务。三个自定义角色实际启动并完成只读验证，现有52项测试通过；结果见本轮配置验证。不得把上表的原型能力标成独立游戏已交付。截图、测试与工程成功不能代替用户视觉验收。

## 有效源文件与生产流程

- P1：`src/growth/{world,grid,buildings,nature,persistence,useWorld,view,scene,renderer}.js`、`WorldMap.jsx`、`WorldPrototype.jsx`及styles。
- P2-B：`src/growth/homestead/{scene.json,tile-rules.js,world.js,renderer.js,HomesteadPreview.jsx,styles.css}`。场景JSON定义地形与独立Sprite，改变配置可移动对象；图像未整场烘焙。
- P2-A：生成脚本与设置在`docs/growth-blender-experiment/2026-10-13/`顶层的`build_cabin.py`、`cabin-config.json`、`pixel_export.mjs`；有效红/蓝`.blend`及PNG位于其`delivery/`。以delivery工程/图像为交付基准，早期目录保留；不要假定脚本也位于delivery。
- P2-B：`docs/growth-p2-b/2026-10-14/build_assets.py`、`produce_assets.mjs`、`terrain-style.json`、`source-models-v2/`及`terrain-tiles/`；游戏资源在`public/assets/growth-p2-homestead/`，manifest记录尺寸、锚点、名义占地、占地偏移、边界、状态、源路径与哈希。
- Blender4.5.14 LTS位于`~/Applications/Blender.app/Contents/MacOS/Blender`，现用固定Cycles CPU/受控色阶。资产原生低分辨率渲染，不从大图缩小。重复生产输出新目录，拒绝覆盖；32色PNG约束不等于半透明场景阴影合成后整个画面仅32色。
- Node/pngjs/Playwright使用本机已有依赖；部分美术脚本引用Codex运行时路径且依赖P2-A帮助函数。独立交付前需记录可移植运行前提，不能仅在这台Mac工作。

## 验证与运行

当前本地场景：`http://127.0.0.1:5188/growth-p2-homestead`；资源页加`?view=assets`；原P1在同服务`/growth-p1`。端口不是持久保证，启动前查实际服务，不清理用户会话。

已有依赖时：`npm run dev -- --host 127.0.0.1 --port 5188 --strictPort`。现有测试：`npm test`。现有浏览器验证：`scripts/verify-growth-p1.mjs`、`scripts/verify-growth-p11.mjs`；P2-B验证：阶段目录中的`verify_assets.mjs`、`verify_models.py`、`verify_browser.mjs`。脚本运行参数和输出边界见各原报告，不能覆盖旧证据。

P2-B交付记录：52项项目测试、55项资源检查通过；264对场景边界与16,384组二值地形连接检查；9工程重开重渲一致，阔冠树重建一致；最终Vite构建成功。Chrome桌面、320/390px模拟和P1/P1.1回归通过；WebKit不可用跳过。这些是历史证据，新的运行结果见[本轮配置验证](growth-agent-verification/2026-10-14/README.md)，不得冒称全套已重跑。

## 多Agent操作约定

官方原生配置在`.codex/config.toml`与`.codex/agents/{art,builder,qa}.toml`。不锁定模型，继承用户选择；同时最多3个子Agent，子Agent不再分派，内置explorer按需调查。Manager为任务选择已加载的角色，不能把通用子Agent取名art就当作自定义角色验证。

角色权限继承父会话。QA默认只读是行为约束，不宣称有独立沙箱；权限级只读审核用只读父会话。当前已运行会话不假定热加载；新会话从此仓库启动，核对项目信任与角色发现，不自动提升权限。

派工卡至少包括：ID、目标/范围、依赖、负责人、唯一写入路径、只读参考、验收、测试命令/证据输出、修复轮数。Art/Builder接口变更必须由Manager协调唯一文件写入者。QA不修改业务，返回ID/严重性/复现/预期/实际/证据/影响/复验条件。

状态流为backlog→ready→running→review→technical_done；发现缺陷转changes_requested，再由责任Agent修复并QA复验；同一缺陷最多3轮。美术状态独立candidate→用户确认→approved。重大产品/视觉/技术取舍或高风险操作才请用户决定，普通已授权实现不反复询问。

阶段测试与QA通过后Manager显式暂存该阶段文件、Commit并在认证允许时Push开发分支，不混入其他修改，不自动合并main。维护本文件任务表及验证证据，确保新对话能接续。完整规则见根目录[AGENTS.md](../AGENTS.md)。

## 后续任务与独立交付验收

以下只是排队，不是本轮实施授权；产品经济与现实任务接入不在默认范围。

| ID | 状态/负责人 | 验收与依赖 |
| --- | --- | --- |
| CFG-001 原生Agent配置与接管 | technical_done / Manager，调查与QA子Agent只读 | 自定义3角色实际启动、文件可读、QA独立审核通过、52项现有测试通过、旧文件无丢失；本阶段只提交配置/接管文档，提交与Push以Git实际记录为准。证据见本轮配置验证 |
| BASE-001 现有有效成果版本化 | backlog / Manager+QA | 分离P2-A/P2-B与私人文件，审查敏感信息/产物必要性，保留全部实验；真实提交清单+测试+远端备份，不能混入本次配置Commit |
| ART-REVIEW-001 候选视觉验收 | awaiting_user / 用户，Art提供证据 | 用户实际评审新树/植被/装饰/地形与家园构图；记录逐项决定，不重做已验收木屋、不自行改approved |
| GAME-001 独立运行边界与入口 | backlog / Builder→QA | 复用现有模块，提供不加载V3业务的独立启动/构建/预览及运行说明，资源完整、桌面/手机可用；不迁移引擎。依赖BASE-001 |
| GAME-002 正交建造适配 | backlog / Builder→QA，Art只维护资产接口 | 32px方格下选择/预览/合法放置/移动/收纳/重摆；地面占地和alpha命中分开，前景对象优先，手机地图及确认同屏，拖动不误放置；不直接套旧菱形投影 |
| GAME-003 独立世界保存与扩张 | backlog / Builder→QA | 明确新命名空间/版本，刷新和重新打开恢复；失败/损坏/并发不丢数据，P1/V3原键保持；四周连续扩张、新土地可建造。依赖GAME-002，存档适配方案先评审 |
| GAME-004 独立模拟成长适配 | backlog / Builder+Art→QA | 复用不破坏建筑布局的环境变化思路，明确原型反馈范围；不新增奖励经济或接现实任务；若涉及新成长表现先定验收 |
| RELEASE-001 独立模块验收 | backlog / Manager+QA+用户 | 覆盖全流程、保存与恢复、非法操作、相机总览、遮挡、资源失败、移动端；独立构建可从说明复现，V3/P1回归通过；美术用户确认、已知问题清楚、提交可恢复 |

完整独立交付必须同时满足：入口/构建独立、已有核心自由建造和扩张/保存能力在新正交场景真正可用、模拟成长不破坏布局、可靠桌面/手机体验、素材来源与工程可复现、自动测试与独立QA通过、用户完成视觉体验验收。不能仅凭静态家园图或旧P1测试宣称交付完成。

当前优先顺序：配置验证已完成，下一阶段先BASE-001归档与ART-REVIEW-001；下一开发任务建议GAME-001，并为GAME-002制定最小适配方案。尚未开始P2-C或业务开发。

## CFG-001任务记录

2026-10-14：Manager检查分支/远端/未提交文件及988份已有文件哈希；原生art_audit与builder_audit并行只读调查各自文件域，qa_takeover只读独立审核。Manager独占配置与文档写入。QA-CFG-001文档缺陷修正第1轮，补正Blender脚本路径；之后自定义Art、Builder、QA在只读父会话实际选择启动、读取并报告，QA限定范围通过。npm test52/52、本地HTTP入口/清单200。无游戏功能写入、无存档访问、无收费生成。本阶段提交仅含配置、规则、接管入口和验证证据；既有P2-A/P2-B未追踪成果仍待单独归档。
