# 独立成长游戏 MVP 候选交付记录

状态：2026-10-15独立MVP候选技术完成，规格/质量独立QA通过，阻断缺陷0。QA-DATAUI-002 / P1 在第1轮（累计1/3）关闭。产品体验与新增美术仍待用户集中验收，不宣称最终视觉approved。工作始于2026-10-14，原证据路径保留；项目状态唯一汇总仍为[主记录](../../growth-game.md)。

## 产品与运行边界

依据[长期产品规格](../../growth-product-spec.md)，实现持续个人世界、模拟努力、永久XP/建造BP、自动生态与自由建造双轨、阶段解锁、收纳、相邻土地扩张和本地保存。不接真实任务数据，不并入V3，不改变P1/P1.1或P2-B原预览。

独立启动：`npm run dev:game`，`http://127.0.0.1:5189/`。
独立构建：`npm run build:game`，输出`dist/game`；`npm run preview:game`访问`http://127.0.0.1:5190/`。两个端口来源不同，存档各自独立。[完整体验说明](release-guide.md)。

新代码在`src/growth/game/`、入口在`game/index.html`与`vite.game.config.mjs`。规则、空间、成长、渲染、交互与持久化分别组织；数值集中`balance.js`。世界仍使用新localStorage键`mingrifu-growth-game-v1`、schema1，未迁移旧存档。并发安全修复只加浏览器原生metadata guard，不引入依赖或权限申请。

## 验收覆盖

| PRD场景 | 已有实际证据 | 最终状态 |
| --- | --- | --- |
| A01 独立运行与新世界 | 独立构建模块图/HTTP、初始8×8/赠送木屋/XP0/BP30 | 通过 |
| A02–03 建造及非法拒绝 | UI四环境闭环、余额与阶段锁定；纯命令原子拒绝 | 通过 |
| A04 视觉命中与遮挡 | 第1轮Alpha修复；独立QA真实Canvas9,698,112样本0误差 | 通过 |
| A05 免费调整 | 木屋移动/收纳/同ID重摆、BP不变、重开一致 | 通过 |
| A06–08 努力与成长 | 61规则测试、真实UI幂等、300XP解锁、生态不动人工布局；拥挤边界规则验证 | 通过 |
| A09 扩张 | 四环境相邻扩张/新地/接缝；QA负坐标多次扩张与扣费拒绝 | 通过 |
| A10 恢复 | 刷新、关页重开、收纳/事件/资源原文一致；另真实Chrome正常关闭再启，新进程恢复LS与IDB | 通过，非OS重启/断电 |
| A11 保存安全与并发 | quota/损坏/未知版本/原文下载/无锁/getter恢复；原生CAS竞争、连续恢复、初始once独立复验 | 通过，P1第1轮关闭 |
| A12 手机流程 | 320×568、390×700真实Chrome触控模拟；地图/抽屉/确认恢复同屏 | 通过，非真机 |
| A13 相机与资源 | 总览负土地/缩小、脚点排序、404重试；已有Art核对木屋屏幕像素 | 通过 |
| A14 无惩罚 | UI虚拟5/7天推进后资源/世界不变、规则无维护计时 | 通过，非真实等待 |
| A15 原功能与成果保护 | P1桌面/320/390、V3任务/计划/目标真实回归；原始998文件无丢失 | 通过 |

UI实现与历史四环境证据：[GAME003/004报告](game-003-004-ui-report.md)。生产数据与额外核心预审：[综合QA](release-data-qa-preaudit/production-core-qa-report.txt)。原型回归：[本轮真实日志](release-old-p1-r2.txt)。缺陷全过程与最多3轮计数：[缺陷记录](qa-defects.md)。原始报告按当时状态保留，不把历史“待修复”文字改造成事后通过。

Manager在最后源码冻结后实际执行：`npm test`180/180、0失败/跳过（[final-r2完整日志](release-final-r2-npm-test.txt)）；`npm run build:game`成功，42 modules、JS `index-Dro1WYHz.js`248.43kB、CSS7.03kB（[构建日志](release-final-r2-build.txt)）。[20份最终源码/测试SHA](release-final-source-hashes.json)可定位受验版本。

Manager另在最终版本重新执行完整真实Chrome155脚本，桌面1280×900、320×568、390×700及生产5190四环境全部通过、各0错误；初始→建造拒绝/成功→屋顶选中→免费移动/收纳/重摆→125XP成长解锁→扩张/新地/接缝木屋→300XP→刷新/关页重开→旧键哨兵不变。[四环境最终JSON](release-game-flows-final.json)、[实际日志](release-game-flows-final.txt)；执行参数为`GAME_RUN_ID=final`与已有Playwright路径，未来重跑须换唯一ID。

新guard需要与世界原文一起持久恢复，因此额外测试一次完整测试浏览器的正常关闭/重新启动：临时隔离持久profile不接触用户profile，真实记录25分钟后关闭owned Chrome，启动新的浏览器进程；LS原文与IDB metadata完全相同，25XP/35BP/revision1、赠屋1、事件1、saved true/readonly false，0错误。[重开JSON](release-browser-reopen-final.json)、[日志](release-browser-reopen-final.txt)、[脚本](release-browser-reopen.mjs)。profile留在仓库外，不提交cache；这是正常关闭验证，不是崩溃/断电/OS重启保障。

底层并发修复Owner47数据测试、16组原生竞争与7故障/种子场景报告：[第1轮数据报告](game-003-data/concurrency-report.md)。UI安全恢复的真实RED/GREEN及兼容/生产场景：[必要UI适配](release-game-guard-ui-r1-report.md)。

最终[独立guard QA报告](release-data-qa-final/qa-guard-r1-final-report.txt)规格/质量均通过、剩余阻断0；QA亲跑47Node和21实际GameApp cases：12原生双页（两排队顺序各6、dev/prod各6）恰一成功/一冲突，失败无奖励并可重读；NULL两页仅1次gift写；7故障含320/390连续失败保留owner/candidate/准确一次奖励、取消重读保护、普通quota取消、原生IDB请求成功后abort、缺能力、leading/crash guard原文下载；生产短核心通过。各case errors[]、四源码最后SHA保持一致，P1第1轮复验关闭。只复制QA列明的22个顶层必要文件，[清单与哈希](release-data-qa-final/inventory.json)，没有profile/cache。

诚实保留驱动边界：原native脚本完成12竞争case后，附带NULL段在外部锁未释放时要求loading结束，命令末尾超时exit1。该原JSON/驱动保持；单独修正NULL驾驶前提后真实exit0通过，不把原整命令冒称exit0、不据此增加业务修复轮数。

## 美术与截图

已验收陶土红木屋原PNG字节不变。复用P2-B树木、植被、石头、围栏、信箱和地形；没有新增或重绘素材。除木屋外及新8×8游戏构图均candidate，未自行宣称用户通过视觉验收。

本轮游戏截图均来自真实Canvas，地形Tilemap和独立Sprite可编辑位置，不是烘焙背景图。最终稳定代码截图：[桌面初始](release-game-flows-final-production-initial.png)、[桌面300XP](release-game-flows-final-production-growth300.png)、[320px初始](release-game-flows-final-phone320-initial.png)、[390px成长后](release-game-flows-final-phone390-growth300.png)、[扩张预览](release-game-flows-final-phone320-expand-preview.png)、[重开恢复](release-game-flows-final-production-restored.png)。每个流程的更多截图与原始前轮证据留在同目录。Manager已实际查看最终桌面/手机图，不以测试代审美。

## 当前已知范围

- 不提供账号、云同步、旧档自动迁移或任意导入；下载原文用于保留记录，不承诺自动恢复。
- 更新后必须刷新已有独立游戏页面；不能保证旧代码/开发者工具绕过协议直接写入时的安全性。
- metadata预提交与localStorage写入间进程中断时，保留原文并保守只读；不自动重置校验，不引入大型日志恢复系统。
- 真机、Safari/WebKit、完整操作系统重启、极限容量/长期大地图性能尚未验证；双指缩放不在MVP。
- 树冠色块、道路纹理重复、初始留白与成长节奏需要用户实际体验判断。机械测试不能决定美术品质。

## Git与恢复

已提交并Push开发分支的前序阶段：`48d4431`规格、`3811fae`BASE归档、`4d100a4`独立构建、`12c8310`建造规则、`465ff6b`成长/扩张规则、`6643291`数据基础、`a9ca5d0`建造界面。最终UI/guard/交付证据通过测试与QA后，作为GAME003/004共享界面的一个真实完成阶段由Manager版本化；提交标题为`feat(growth): deliver standalone dual-track game candidate`。具体Commit ID与Push结果以Git日志、origin跟踪核对及最终交付消息为准，避免在提交内伪造自引用编号。不使用`git add .`，不混入其他既有修改。

main保持`990f7ff11718a0131ca1b96f34fbc049317ad95d`，v4-development保持`44d16da058c2ff8259459d35f8464f01dd7e995d`。既有PixelLab历史资料、作品集/私人文件与4份私人安全索引原样保留，不混入提交。998文件安全基线与仓库外原始备份可恢复既有成果；最终核对[安全记录](release-final-safety.json)：missing0、994不变、4授权修改，20受验源码哈希一致，木屋原图字节相同。不自动合并main或开始主产品集成。
