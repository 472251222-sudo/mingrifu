# P1 临时像素素材来源

- 从本仓库 `v4-development` 的提交 `44d16da058c2ff8259459d35f8464f01dd7e995d` 只读取得。
- 原文件：`public/assets/pixel/tree-atlas.png`、`city-atlas.png`、`manifest.json`、`LICENSE.txt`。
- 本目录只保留两张原始图集，并从清单筛选四类建筑及四类植物的帧位置。
- 授权声明见 `LICENSE.txt`（CC0 1.0）；未引入历史世界领域规则、存储或旧 Canvas 渲染器。
- 植物仍使用历史图集。建筑现在由 `src/growth/isometric-art.js` 生成临时像素图，墙面、屋顶、占地与地面共用 2:1 投影；原始城市图集保留作为来源参考，当前世界及建筑选择卡不再绘制它。
- 这些都是 P1 交互验证的临时美术，不是新成长世界的最终资产。
- 水面、草地纹理、网格及放置提示由 P1 `renderer.js` 与 `isometric-art.js` 按统一逻辑像素绘制，缩放关闭平滑插值。
- 不使用历史预先合成的地图图片，不继承其固定建筑位置、150 行动区域规则或旧主题配置。

## P1.1 候选美术样板

- 源码：`src/growth/sample-art.js`。木屋、树、草地由本轮在仓库原创的 Canvas 像素绘制生成，没有使用外部图库或图像生成模型。
- 导出样本：`docs/growth-p1.1/sample-cabin.png`、`sample-tree.png`、`sample-grass.png`。PNG 为浏览器直接导出的原生逻辑分辨率图像，未模糊插值或后期修图。
- 原创样板供本项目使用，未另行声明公开素材许可；它们不属于上述历史 CC0 图集。历史对比中的植物仍按原 `LICENSE.txt` 的 CC0 1.0 声明使用。
- 样板仅用于 `/growth-p1?view=art` 的只读场景，尚待用户视觉确认；未替换存档世界的建筑或自然资产。
- 现有 `isometric-art.js` 只补齐房屋缺失的山墙，不将候选木屋的完整视觉规范推广到书屋、茶屋等类型。
