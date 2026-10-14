# QA-DATAUI-002 第1轮执行计划

Manager已确认原生根因和小型IDB预提交CAS方案；按writing-plans/TDD/验证流程执行，主任务状态仍由Manager维护。已授权，不另行请求用户批准。

范围唯一写入者data Builder：persistence.js（安全事务接入）、新增checkpoint.js（单metadata记录的原生IDB适配）、现有useGameWorld.js如需（Hook公共API不变）、game-persistence/game-checkpoint测试；新证据concurrency-*。不写UI/规则/主记录，不派工/Git/安装/权限修改。

- [ ] RED：stale renderer缓存同token双客户端最多1成功，guard预提交abort零LS写，LSfail旧raw+oldworld，rollbackfail只读sameowner retry；保留真实失败。
- [ ] RED：原生IDB适配以transaction.complete而不是request.success回执，schema/nonce/CAS校验；缺IDB/crypto只读、bootstrap无世界复制、guard mismatch/unknown保留raw。
- [ ] GREEN：checkpoint API `fingerprint(raw,revision)`、`verify(point)`、`reserve(expected,next)`、`rollback(reservation)`；每service稳定owner nonce。元数据仅schemaVersion/digest/revision/previousDigest/previousRevision/owner，不存world。
- [ ] GREEN：WebLock内read/token/revision校验→原子guard.reserve并等complete→LS syncsetItem→成功直接回执；LS失败仅rollback metadata。publish前内部awaitverify；普通conflict仅reload，checkpoint_pending只读保留samepending可同owner retry。
- [ ] 运行原31+新data/checkpoint、全套npm test、独立build；原日志不覆盖。
- [ ] 新隔离Chrome真实游戏UI/native两页有限重复竞争、首次null seed与旧键/保存刷新/故障；独立QA复验同缺陷计1/3。

风险边界已批准：预提交和LS之间崩溃可能留下超前摘要，保守只读并保留有效旧raw，不自动reset/expiry/清空guard，不恢复任意写。IDB不是正式世界存储，无数据迁移；能力/事务错误不降级不安全保存。
