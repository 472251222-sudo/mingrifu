# GAME-002 正交自由建造

依赖BASE-001；页面集成依赖GAME-001，纯规则与入口隔离可先并行。规格为growth-product-spec.md A02..A05/A12/A13，全部新功能在src/growth/game，不修改现有正式业务/素材/存档。

规则负责人 /root/game_rules：唯一写balance.js/world.js/spatial.js、tests/game-world.test.mjs、game-002-rules报告与实际日志。集中价格/阶段/初始配置，纯create/apply/validate、空间占地/前沿。初始8×8、0XP/30BP、赠送木屋与Art建议自然配置。合法首次建造扣BP、免费移动收纳重摆保ID，非法操作原子拒绝，自然只在合法确认时退让。按任务指令执行真实RED/GREEN。

UI负责人 /root/game_builder：001审核通过后唯一写scene.js/renderer.js/WorldCanvas.jsx/GameApp.jsx/styles.css、tests/game-view.test.mjs、game-002-ui报告/日志/独立浏览器证据。不写规则文件；读取已约定API。复用homestead资源加载/地形连接与Sprite绘制原则，适配动态负坐标，不套用旧菱形渲染。

API：world={schemaVersion,revision,nextId,chunks,xp,bp,efforts,objects,nature,path}；坐标整数占地左上，收纳x/y=null；applyGameCommand支持build/move/store/place；placementCheck返回{ok,message}。每个对象地面锚点=(位置-footprintOffset)*32，Sprite位置=锚点-anchor。ASSETS/BALANCE/stageForXP集中配置用于同一目录/价格/锁定反馈。

验收：合法花建造30→28；无效/取消无改变；已赠送木屋点击屋顶/墙面/占地可选，透明像素不抢点，前景优先；移动/收纳/重摆同ID且0BP；320/390手机底部抽屉收起后地图、提示和确认同屏，拖动不误触；动态总览/软边界/最近邻缩放；现有回归测试。保存/努力入口随后阶段，不用假按钮宣称已完成。

Manager唯一修改PRD/主记录/任务文档及Git。QA独立需求/质量审核；缺陷最多3轮。技术完成与美术candidate/用户验收分别记录。
