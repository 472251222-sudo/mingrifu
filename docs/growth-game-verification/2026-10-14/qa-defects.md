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

## QA-DATAUI-001 / P2 / closed / 累计1/3轮

独立生产数据QA，GameApp SHA6d642dbd…；320×568初始保存后打开模拟努力抽屉，注入新key的QuotaExceededError，再点50分钟。XP0/BP30/raw均保留（事务正确），但抽屉遮住外层game-save-error重试/取消按钮；真实click超时，elementFromPoint恢复按钮中心落到抽屉disabled分钟输入。预期保存错误及恢复操作同屏可触达，不要求先找X关闭；重试同attempt/UUID/candidate，成功只一次奖励，取消保持原世界。

源GameApp64-68/141/149与style叠层；原Builder第1轮最小修复及真实UI回归，数据QA继续其余故障预审后按稳定版本复验。原证据/tmp/mingrifu-dataui-qa.u6Ge35/02-quota-effort-drawer.png与modal-probe.json，只保存必要文件不纳入profile。不以手动关抽屉绕过算通过。

第1轮关闭：GameApp fc3ec93a…仅在effort抽屉+pending+error+非busy时收起模态，保留原attempt/UUID/candidate；QA真实retry/cancel直接可达、同candidate字节不变、50XP/10BP一次。其他坏档/无锁/getter恢复/initialonce共10生产场景通过；独立QA综合报告production-core-qa-report.txt明确该ID已关闭，不归因于后续独立并发问题。

## QA-DATAUI-002 / P1 高 / closed / 累计1/3轮

A11真实间歇覆盖：Chrome155，同BrowserContext/同5189 origin；单控制页只预置合法revision0原文一次，两个生产页初始native token相同；无Storage/getter/locks override。A持同save WebLock、B25分钟先queued/A10分钟后queued，query验证pending2，释放。3隔离runs第0双方saved=true/readonly=false/rev1且宣称各自奖励，最终两页原生getItem只有A事件；B刷新从25XP35BP变10XP32BP，已宣称成功事件丢失。另两次正确一成功一冲突，不能否认间歇缺陷。

证据native-two-tabs-clean.mjs/native-clean-races.json runs0和clean-race-0-a/b/b-reopened.png，必要文件已另存release-data-qa-preaudit/，无profile。persistence SHA5358530f / GameApp fc3ec93a / HEAD a9ca5d0。原数据Builder先独立根因调查，不能盲延时或在失败前提宣称通过；若需要额外可靠原子guard须证明读写/失败/旧数据保护，不擅自大迁移持久化。修复最多3轮。

第1轮已批准：data owner在真实UI背景的native service12中2/直接native协议12中3复现，精确B setter返回后A独占锁仍read0、随后storage事件才到。WHATWG/Chromium原生缓存与IDB事务主规范核查见game-003-data/concurrency-investigation/root-cause.md。小型IDB只metadata SHA/revision/previous/owner，先CAS oncomplete再LS写，失败原文保护/安全回滚；load异步verify、缺能力只读、不大迁移或盲延时。crash窗口保留原文且metadata超前则只读不自动重置，明确验收边界。Manager已批准原data owner第1轮TDD/native复验。

2026-10-15第1轮关闭：独立QA规格/质量均通过、剩余阻断0，亲跑47Node与21真实GameApp cases：12原生双页（两序各6、dev/prod各6）均一成功/一冲突、拒绝0扣发，NULL两页单gift；7故障涵盖320/390连续失败保持owner/candidate、拒绝取消/重读、一次正确奖励、普通quota取消、原生IDB请求成功后abort、缺能力与领先guard原文下载；生产简核心通过。最终persistence b44b293c、checkpoint094c4b3c、GameApp20bec0ec、Hookf9589a1f冻结一致。报告和22明确必要证据见[最终QA](release-data-qa-final/qa-guard-r1-final-report.txt)。原native驱动末尾NULL错误等待/exit1保留，单NULL修正驱动exit0；不伪称原整命令通过、不计业务修复新轮。Manager final180/180/build/四环境闭环/正常浏览器新进程重开通过。崩溃保守只读、真机/Safari/断电未验及用户视觉候选边界仍明确。
