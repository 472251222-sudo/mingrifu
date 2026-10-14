# 独立成长游戏 MVP Implementation Plan

执行：Codex原生Manager统筹、Builder实现、Art维护资源边界、QA独立只读审核；采用Superpowers方法并遵守项目覆盖规则，不等待逐任务用户指令。Spec：[growth-product-spec.md](growth-product-spec.md)。状态与证据主记录为growth-game.md。

**Goal**：交付正交像素世界的建造/成长/保存/扩张完整候选闭环。
**Architecture**：保留P1/P2-B，新增`src/growth/game/`隔离模块；复用P2-B资产加载、地形连接与Sprite元数据，适配动态区块/脚点。规则与状态纯函数，UI先存储成功再提交状态，集中balance配置。
**Tech Stack**：已有React19/Vite6/Canvas2D、Node测试、已有Playwright/Chrome；不增加依赖。

## 约束与审核关注

Manager唯一修改PRD/主记录/AGENTS/阶段Git；Builder唯一写game、独立入口/配置/package脚本和新功能测试；Art只读审查源资产并提供校准建议，不改已验收PNG；QA不改业务。无Worktree前置、无自动删除、无main合并、同缺陷最多3轮。保存/奖励幂等、费用原子性、预览拖动、稀疏负区块、自然避开人工为重点风险。

## Task SPEC-001 产品规格与覆盖审核

Manager：PRD、此计划、AGENTS和growth-game.md。QA核对12核心与A01..A15均有任务及断言，数值小细节可实现，旧“未定经济”规则更新，不阻塞人工视觉验收。无生产代码，文档不做伪TDD。证据写`docs/growth-game-verification/`。

## Task BASE-001 安全归档

依赖SPEC-001。Manager在仓库外保存未提交成长成果备份与哈希；Art只读资产/敏感/大小审查；QA审查显式文件清单。归档P2-A/P2-B有效源码、真实工程/原图/参数/导出/验证/文档、依赖研究，保留实验本地，不纳入私人作品集/缓存/密钥。不修改有效内容。实跑现有npm test与资源检查（新输出目录），必要临时Vite构建；明确candidate状态。提交/Push后再实现GAME。

## Task GAME-001 独立启动与构建

Builder所有权：`game/index.html`、`vite.game.config.mjs`、`src/growth/game/main.jsx`与最小`GameApp.jsx`/样式、package.json新增`dev:game/build:game/preview:game`、`tests/game-build.test.mjs`。不改src/main.jsx/V3/Vite原配置。独立Vite以game目录为root，别名/允许路径解析仓库内game模块，根URL也只能打开游戏；构建只复制本游戏资源。

- [ ] 先测试实际独立构建输入/输出契约，观察RED。
- [ ] 独立HTML加载新的game入口，复用家园资源显示初始占位只读世界；构建输出`dist/game`、无V3业务chunk。
- [ ] GREEN、全套测试、实际独立启动与临时构建/预览HTTP检查；QA规格+质量审核，Manager阶段Commit/Push。

## Task GAME-002 正交自由建造与基础状态

依赖BASE/GAME-001。Builder所有权`balance.js`、`world.js`、`spatial.js`、`scene.js`、`renderer.js`、`WorldCanvas.jsx`、GameApp/样式及`tests/game-world.test.mjs`、`game-view.test.mjs`。不修改原homestead接口。

接口约定：`createGameWorld()`初始模型；`applyGameCommand(world,command,now)`纯命令、无副作用、非法抛明确错误；`validateGameWorld(world)`存档输入校验；`placementCheck(world,assetId,x,y,ignoreId)`；`worldToScene(world,manifest)`动态地形/人工/自然渲染数据。人工对象用id/asset/x/y/stored；区块用x/y，资源为xp/bp，事件为efforts；schemaVersion=1。

- [ ] TDD：A02..A05合法放置/费用、取消、不合法/锁定/BP不足原子性、移动收纳重摆同ID；脚点/透明命中/排序/相机/负坐标。
- [ ] balance采用PRD初始参数，基础扣费先在纯命令内实现；GAME-004再实现努力入口与生态/阶段反馈。初始世界按PRD，有真实素材与留白。
- [ ] 手机抽屉/固定动作区，拖动阈值与预览/相机兼容，桌面键盘。真实浏览器流程，GREEN和QA后提交。

## Task GAME-003 保存与扩张

Builder所有权`persistence.js`、`useGameWorld.js`、原game模块与`tests/game-persistence.test.mjs`、新浏览器验证脚本。延续P1安全思路，不读旧键。

- [ ] TDD：A09..A11、A13，区块相邻/20BP/一次消费/负坐标/跨边界；新schema键、损坏/未知版本不覆盖、写失败旧世界不变、重试/跨页冲突。
- [ ] load/save保持token，在同源Web Locks内序列化读取/校验/写；缺少锁时明确只读，不能复用P1非原子检查当作并发保证。成功保存才发布状态，失败保留候选及重试/取消。初始种子不重复赠送。扩张预览/固定确认，新地实际可建，相机动态总览适配。
- [ ] 隔离浏览器刷新和重新上下文打开、旧键哨兵/404/保存故障/同步双页竞争（仅一项提交）/无锁只读/手机流程；完整测试+QA后提交。

## Task GAME-004 双轨成长与解锁

Builder所有权`growth.js`（可并入小型纯world模块但不得膨胀）、balance及GameApp、`tests/game-growth.test.mjs`和浏览器脚本。Art只读检查现有素材替换阶段/锚点，不产生新的已验收资产。

- [ ] TDD：A06..A08、A14；事件1..180/10-25-50奖励、幂等、永久XP、两阶段、每50XP生态、跨阈值/无空地/人工不变、非法/溢出。
- [ ] 模拟努力入口及历史/反馈、阶段进度、解锁目录；不接主产品，不加复杂经济。显示资源变化与自然变化，失败同id重试。
- [ ] 真实完整游戏循环+QA，阶段Commit/Push。

## Task RELEASE-001 候选交付

QA依据PRD A01..A15全覆盖审核，Manager核对资源/脚点/遮挡/数据/独立构建及V3/P1回归；真实Chrome桌面/320/390手机、总览/近景/成长前后/扩张后截图。遇缺陷分派Builder/Art修复，逐ID计最多3轮。记录未验证实机/Safari与已知视觉候选问题；产品体验与美术合格最终由用户验收。发布本地可体验入口、启动构建说明、阶段Git和证据，不部署云服务、不合并主产品。
