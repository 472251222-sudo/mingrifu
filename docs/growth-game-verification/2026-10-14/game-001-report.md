# GAME-001 实现报告

状态：review，等待 Manager / QA。依据 [task-game-001.md](task-game-001.md)，本地基线 `3811fae`，实际分支 `feature/growth-rebuild`。Builder 无 Commit、Push、Worktree、依赖安装或生成服务调用。

## 交付范围

- 新独立 HTML 根入口，原生标题“明日复·我的世界”。新 React 入口只导入 GameApp 与 P2-B 家园接口，不加载 V3 App 或业务。
- Vite 以 `game/` 为 root，`/src` 别名解析仓库源码。`dev:game` 默认 `127.0.0.1:5189`、`preview:game` 默认 `127.0.0.1:5190`，均支持 Vite CLI 参数覆盖。`build:game` 只输出 `dist/game`；原 Vite / Sites 配置未改。
- 复用 `loadHomesteadAssets`、`prepareScene`、`paintHomestead`、P2-B 原 scene 元数据和相机规则。只读壳可拖动、方向键平移、按既有最近邻倍率缩放与世界总览；错误有素材重试入口。
- 资源插件只提供/导出 12 份运行文件：原 manifest、11 张 PNG（10 Sprite + 地形图集），按原 URL 提供，不复制整个 public / 源工程 / 私人文件。

本任务明确使用原 P2-B **12×12 临时只读场景**，不是最终 8×8 新用户模型；不读取、写入、迁移世界存档，不提供 XP/BP、努力、建造或保存。GAME-002..004 接入这些已计划功能。木屋保持 approved，其他资源及场景保持 candidate，本报告不作美术验收。

## 验证与证据

环境：macOS，本机 Node `v24.16.0`、npm `11.13.0`、Vite `6.4.2`、React `19.2.0`；已有 Chrome `155.0.8059.40` 与已安装 Playwright。Chrome 均使用新建隔离上下文，没有读取用户浏览器或正式存档。

| 实际命令 / 场景 | 结果 | 证据 |
| --- | --- | --- |
| `node --test tests/game-build.test.mjs`，实现前 | RED：1 失败，实际游戏构建契约缺失，无法解析尚不存在的独立 config | [game-001-red.txt](game-001-red.txt) |
| 同命令，实现后 | GREEN：3 通过、0 失败；真实 Vite build + dev/preview HTTP，不只检查配置文本 | [game-001-green.txt](game-001-green.txt) |
| `npm test`，最终 HTML 修复后 | 55 通过、0 失败、0 跳过 | [game-001-npm-test-final.txt](game-001-npm-test-final.txt) |
| `npm run build:game`，最终版本 | 成功；33 modules，HTML + CSS/游戏 chunk + 12 运行资源 | [game-001-build-final.txt](game-001-build-final.txt) |
| `npm run dev:game` / `npm run preview:game` | 默认根 URL 正确打开独立壳与全部资源 | [game-001-dev.txt](game-001-dev.txt)、[game-001-preview.txt](game-001-preview.txt) |
| Playwright Chrome 桌面 dev + preview、320/390px 手机模拟 | 4 流程通过；真实 Canvas 有世界像素，最近邻关闭平滑，缩放/拖动/方向键/总览/刷新通过，无横向溢出，无 console/page/request 错误，无 V3 请求 | [game-001-browser-r2.json](game-001-browser-r2.json)、[执行日志](game-001-browser-r2.txt) |
| 隔离路由将木屋 PNG 返回 404，然后恢复并点击重试 | 提示明确、重试重新显示真实世界，旧存档哨兵不变 | [失败状态截图](game-001-browser-r2-resource-error.png)、同上浏览器 JSON |
| 19 份受保护 V3/P2-B 源文件与素材对比 `3811fae` | SHA-256 全部不变 | [game-001-protected.json](game-001-protected.json) |
| 范围内 `git diff --check` | 退出 0 | 本轮实际命令输出 |

自动构建测试还验证：输出 HTML 脚本指向真实 chunk，打包模块图含新入口/真实家园 renderer，排除 `src/main.jsx`、`src/App.jsx`、`src/domain/`、`src/components/`；临时输出只有 index + assets，资源源文件/输出字节一致，dev 别名入口返回 JavaScript，全部运行资源 HTTP 原字节一致。测试仅清理自身创建的临时输出，不覆盖原 dist/client 或旧证据。

浏览器执行命令：

```sh
GAME_RUN_ID=r2 PLAYWRIGHT_MODULE=/Users/lyc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node docs/growth-game-verification/2026-10-14/game-001-browser.mjs
```

`GAME_RUN_ID` 给每轮新证据前缀，后续重跑必须换值，默认使用时间戳。源码配置与运行入口没有绝对机器路径；上面的已有测试工具路径仅是本机验证环境。

实际截图已人工打开检查：

- [桌面 dev 总览](game-001-browser-r2-desktop-dev-overview.png)、[桌面 dev 放大](game-001-browser-r2-desktop-dev-zoom.png)
- [桌面 preview 总览](game-001-browser-r2-desktop-preview-overview.png)、[桌面 preview 放大](game-001-browser-r2-desktop-preview-zoom.png)
- [320px 总览](game-001-browser-r2-phone-320-overview.png)、[320px 放大](game-001-browser-r2-phone-320-zoom.png)
- [390px 总览](game-001-browser-r2-phone-390-overview.png)、[390px 放大](game-001-browser-r2-phone-390-zoom.png)

独立 dev / preview 保持运行供 QA 使用，Builder exec session 分别 `54449` / `40454`；Manager 可在审核结束后关闭本任务进程。

## 失败记录与最小修正

1. 自动服务测试最初使用 `port:0`，Vite 6 实际回退到已有 `5173`，导致端口占用。保留 [attempt-1](game-001-attempt-1.txt)，测试改为游戏端口并允许为自身新服务寻找可用端口；生产端口仍固定且 strictPort=true。
2. HTTP-only 测试立即关闭服务时，Vite 后台依赖扫描取消并等待浏览器依赖爬取，进程未结束。实际读其 close / optimizer 代码定位；终止本任务测试进程并保留 [attempt-2](game-001-attempt-2.txt)。此聚焦 HTTP 测试关闭后台依赖发现并消费入口响应正文；真实 Chrome 仍使用未经测试覆盖参数的正常 dev 配置，完整运行通过。
3. Chrome 第一轮捕获默认 `/favicon.ico` 的 404；用 console location 单独复现确证，HTML 增加 data favicon 声明。保留 [首轮失败日志](game-001-browser.txt)、[首轮桌面总览](game-001-desktop-dev-overview.png)、[首轮桌面放大](game-001-desktop-dev-zoom.png)。第二轮新文件全部通过，不覆盖首轮。

初次记录 RED 的 shell 使用 zsh 保留变量 `status` 导致命令包装退出，未改生产文件；改用 `game_test_exit` 后重新实跑并读取完整 RED。未将该包装错误计为 RED 证据。

## 文件与限制

业务/配置/测试文件共 7：`game/index.html`、`vite.game.config.mjs`、`src/growth/game/main.jsx`、`src/growth/game/GameApp.jsx`、`src/growth/game/styles.css`、`package.json`（仅新增 3 个脚本）、`tests/game-build.test.mjs`。

证据为本报告、本目录 `game-001-*.txt`、`game-001-browser.mjs`、`game-001-*.json`、`game-001-*.png`；PNG/JSON/MJS 扩展由 Manager 在本轮明确授权，只创建新文件。生成 `dist/game` 是指定构建结果，不提交构建目录。Manager 主记录、其他 Builder 规则路径、私人文件未写。

手机模拟已用 `touchscreen.tap` 验证放大按钮；Canvas 拖动用 Playwright mouse 指针验证，**尚未实测连续 touch drag 手势**，GAME-002 需补完整触控交互流程。未验证 Safari/WebKit、真手机、完整游戏命令/存储/经济、最终 8×8 世界；这些属于后续任务/候选交付。当前总览在桌面为 1×、手机为 0.5×，保留全部场景且可整数放大；最终游戏布局与产品/视觉验收仍待后续阶段与用户确认。
