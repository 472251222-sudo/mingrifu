# 原生多Agent配置与接管验证

日期：2026-10-14。范围仅调查、配置、文档、只读验证与本次配置提交；没有游戏功能开发。

## 配置与依据

本机Codex CLI：`0.162.0-alpha.17.2`。用户层已将此仓库标记trusted；原项目不存在AGENTS.md、.codex/config.toml或角色文件，没有覆盖有效设置。

配置使用当前官方的独立角色文件：`.codex/agents/{art,builder,qa}.toml`，各含name、description、developer_instructions。根配置仅启用agents并设`max_concurrent_threads_per_session=3`，不指定模型、provider、凭据或权限。QA的只读是行为规则，不宣称能用角色配置覆写父会话沙箱。

官方资料（本轮已读取）：[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)。当前接口不需要机械套用早期features.multi_agent开关或重复声明config_file角色。

## 已执行

- 当前主对话实际启动了`art_audit`、`builder_audit`、`qa_takeover`原生子Agent，均完成只读文件调查/审核并返回结果；此项不冒称三份自定义角色自动加载。
- Codex `--strict-config`通过，原生app-server `config/read`解析到项目`agents.enabled=true`及3线程上限。
- 只读CLI验证已实际以`agent_type=art`选择并启动自定义Art，返回`/root/cfg_verify_art`，并核实木屋approved、新素材candidate。初次继承ephemeral父上下文时遇到thread-store错误，使用独立上下文成功；原生工具未提供关闭接口，没有伪造关闭成功。
- Builder与QA随后均实际通过`spawn_agent`的`agent_type`选择启动，返回`/root/verify_builder_readonly`及`/root/verify_qa_readonly`，均完成只读任务。QA还明确确认收到的角色指令与qa.toml对应内容一致，限定范围审核通过。详见[native-role-results.md](native-role-results.md)及[verification.json](verification.json)。
- 本轮重新运行`npm test`：**52/52通过，0失败、0跳过**，详见[project-tests.txt](project-tests.txt)。没有重跑旧建模、美术导出或整套浏览器回归。
- 当前服务对`/growth-p1`、`/growth-p2-homestead`和P2-B资源清单的HTTP只读检查均200。它证明入口/清单可访问，不替代浏览器画面验收。

首次CLI模型请求直连超时；后续验证会话沿用本机已配置的网络代理，连接恢复。仅在该会话传入代理环境，没有修改系统网络设置、项目权限或用户认证。生成服务被禁用；没有使用PixelLab额度或付费生成服务。原始CLI事件/诊断留在仓库外临时目录，提交的证据只保留必要结果，不包含认证或密钥。

## QA与修正

原生只读QA报告`QA-CFG-001`：接管记录应明确Pixelorama只有研究、编辑实操未验证。Manager已修正文档，未改历史实验报告。Manager还补正P2-A源码路径：脚本在实验顶层，交付工程/PNG在delivery，二者不能混淆。均为文档修正第1轮；修正后自定义QA限定范围审核通过。最终证据与11文件提交范围已由原生只读QA第1轮复验通过，未发现新的客观缺陷，没有业务返工。

## 版本与保护

开始时feature/growth-rebuild/`65774ef568ca467f0cae530702e8f7d87dde0b4c`；main与v4-development不改。仓库外记录988份已有文件哈希；本轮既有文件唯一授权改动为`docs/growth-p1/README.md`增加接管入口。既有`src/main.jsx`改动、美术实验、P2-B和私人文件不纳入本次Commit。

最终配置阶段文件清单与保护核对见[verification.json](verification.json)。Commit/Push结果以交付时Git实际结果为准，不能用预期结果冒充已完成。本记录随阶段提交存入Git，最终提交号由Git日志确定，避免为自引用提交号制造多余提交。

## 恢复与后续

新Manager从仓库启动后先读根AGENTS.md、[接管记录](../../growth-game.md)和本记录。现有对话不假定配置热加载；本轮CLI选择自定义角色成功与当前主对话只支持task_name的派工接口需分开理解。

当前原生工具没有关闭已完成Agent的接口。completed列表不是正在运行的子Agent；后续优先用followup复用角色，达到线程上限时不再启动第四个，不构建生命周期编排框架。

本轮之后不自动继续业务开发。建议下一阶段先单独审查/提交P2-A/P2-B有效成果，再实现独立启动/构建边界和正交建造闭环。未追踪成果只在当前工作区，配置Commit不是完整游戏备份。
