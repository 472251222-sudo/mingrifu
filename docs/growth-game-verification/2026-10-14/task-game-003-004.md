# GAME-003/004 数据、扩张与双轨成长

Manager连续执行，无需逐项用户指令。依赖GAME-002稳定world与command API；允许先完成004纯规则再003持久化集成，避免扩张UI没有获取XP/BP的合法入口。主任务编号与PRD验收不变。

规则Builder唯一写balance.js/world.js/spatial.js/growth.js及game-growth测试：effort命令含唯一id/source/minutes/occurredAt/label；10/25/50快捷和1..180整数。永久XP=分钟、BP=floor(minutes/5)，同id同内容无操作/同id不同内容拒绝；每50XP边界逐次生态变化，人工布局和道路严格保护。阶段120/300集中推导；expand命令相邻8×8、负坐标、20BP/120XP、禁止重复/跨空地，原坐标不移。

数据Builder（另行唯一分配）写persistence.js/useGameWorld.js/game-persistence测试：键mingrifu-growth-game-v1，schemaVersion1，严格load校验；先写成功再发布UI世界。使用Web Locks串行read-token-check-write；无锁只读。失败重试沿用同command/eventid，旧世界与资源不变；跨标签竞争至多一项提交，另一页冲突并要求重读。坏档、未知版本、禁止访问不得自动清理/覆盖；提供读取/原始记录下载，不增加导入/回滚/旧档迁移。

UI Builder唯一写GameApp/WorldCanvas/renderer/scene/styles及浏览器脚本：接入hook事务、明确保存/失败/冲突/只读反馈；努力表单/历史/资源变化/阶段下一解锁；扩张候选区域、确认/取消同屏，新增土地可建且总览适配。新用户自动种子先可靠保存，不刷新重复赠送；不加载主产品/V3，不访问旧键。

QA只读逐阶段规格与质量验收、缺陷最多3轮。验收A06..A11/A13/A14以及320/390全闭环；同步双页、故障注入、无锁、未知版本/损坏、旧键哨兵检查必须隔离浏览器上下文。真实RED/GREEN、独立构建和原测试证据保存新路径；不覆盖P2原报告。
