# GAME-001：独立启动/构建

需求来源docs/growth-product-spec.md及growth-development-plan.md Task GAME-001；全局规则AGENTS.md。BASE-001本地基线3811fae，全部有效P2-A/P2-B已归档，原PNG不改。

Builder唯一写入：game/index.html、vite.game.config.mjs、src/growth/game/main.jsx、GameApp.jsx、styles.css、package.json仅新增dev:game/build:game/preview:game、tests/game-build.test.mjs、本目录game-001-report.md及game-001-*.txt证据。Manager修改主记录/Git；QA只读。不得修改V3入口src/main.jsx或原Vite配置/P1/homestead/素材；不加依赖/生成服务、不创建worktree、不再分派、不提交或Push。

本任务只完成独立壳与真实家园资源显示，后续GAME-002..004提供完整世界/经济/保存。复用loadHomesteadAssets、prepareScene、paintHomestead和现有scene元数据；不整体复制P2-B UI。游戏壳不应加载App.jsx或V3业务。

独立Vite建议game为root（根URL只能返回游戏index），以/src别名指向仓库src并允许仓库内源码；build只复制本游戏public资源到dist/game，原dist/client与Sites构建不改；HTML入口原生标题“明日复·我的世界”。dev固定本地127.0.0.1:5189，preview5190；脚本允许参数覆盖端口。无绝对机器路径。确认实际Vite别名/HTML解析，不依赖猜测。

TDD：先写测试观察真实独立构建契约缺失的RED（非拼写错误），再实现GREEN；实际构建输出HTML+游戏chunk+素材，检查不包含V3业务入口/页面、PNG哈希未变，dev/preview根URL打开正确壳且素材可加载。构建测试可使用临时输出，避免覆盖原dist。测试新入口行为，不能只grep配置文本。

跑全部npm test、build:game及独立服务Chrome/HTTP检查（已有Playwright可用，不安装；隔离上下文，不访问用户存档）；记录实际命令/RED/GREEN及路径。完整报告写game-001-report.md，最后仅回复状态、测试摘要、变更文件、限制和报告路径。遇到普通细节依规格简单实现，核心冲突才报告Manager；不重复产品方向讨论。
