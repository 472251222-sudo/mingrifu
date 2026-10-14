# 本轮可复现缺陷与修复轮数

主状态仍在growth-game.md；本文件仅保存缺陷细节，每项全程最多3轮，不因换Agent重置。

## QA-DATA-001 / P2 / closed / 累计1/3轮

独立QA game_data_qa，基线465ff6b。persistence.js创建service时缓存初次默认localStorage getter的SecurityError，read永久重抛。复现：getter拒绝→controller.initialize false；同getter恢复返回有合法旧world的Storage→外部getItem成功→controller.reload仍false/fault/storage_unavailable。0写入，原raw不变，数据安全但恢复操作失效。

预期：同controller重新读取重新检测当前可访问Storage，恢复旧world/资源/ID/事件、saved=true并解除故障；不额外写种子。持续拒绝仍只读、零写入。Manager核对源码45/57符合QA根因，已分派原数据Builder第1轮TDD最小修复。稳定API/注入Storage语义不改，不扩大权限。

QA数据亲跑27/27；额外努力→扩张→建造→移动→收纳→重开→重复事件→重摆→再次恢复深比较通过（XP180/BP44/revision6/两区块/两人工/一事件）。唯此恢复缺陷阻止数据子阶段通过；完整游戏浏览器闭环另验。

第1轮关闭：默认每次操作重新检测Storage；独占锁内capture同一对象read/write，显式注入稳定，Hook/API不改。真实RED30pass/1fail→GREEN31；QA fresh亲跑31/31与原反例恢复成功、saved true、readonly false、0写、原raw不变。真实Chrome同Hook桌面320/390恢复旧world并后续努力保存一次。初次浏览器504属于验证cache冲突，独立临时cache重跑通过，不计第2业务修复。数据子阶段规格/质量通过，整GameUI另验。

## QA-G002-001 / P2 Important / closed / 累计1/3轮

独立QA superpowers_workflow_qa以真实Chrome155/当前UI复现A04缺陷：320×568、Canvas298×339，.25 origin[118,138]点local[145,143]，可见陶土屋顶却选中空；.125 origin[134,154]点[142,159]可见木屋却选自然树n-2。读取原PNG Alpha的命中坐标没有对应Canvas最近邻实际栅格取样；.25/.125整数矩阵差异28/11，.5分数指针也有差异，未经栅格验证简单偏移不够。

QA原始临时证据完整另存game-002-qa-scale-before/，不覆盖或删除原目录。预期所有支持倍率/分数指针按实际绘制Alpha选择前景，保留占地fallback与现有碰撞规则；需真实Canvas对照回归和上述UI坐标复验。已派原UI Builder第1轮TDD修复，暂停003/004界面集成直至002复验通过。纯视图11/11与规则61/61之前均通过，却未覆盖此采样差异，不能作为该缺陷已修证据。

第1轮关闭：使用1px屏幕Canvas相同绘制矩阵、整数栅格平移实际Alpha采样，所有对象前景先于人工占地fallback；不改碰撞。真实RED2,930差→GREEN9,698,112样本0差，QA独立重跑相同8倍率/3场景/4分数坐标完整Canvas oracle也0差，并亲跑12视图测试；原两个实际UI点均o-1。GAME002规格/质量通过，0新增缺陷。复验证据game-002-qa-scale-fixed/；浏览器临时profile副本存仓库外安全备份，不提交cache/私人文件。
