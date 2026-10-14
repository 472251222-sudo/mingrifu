# P2-B 原创资源清单

日期：2026-10-14。仅暖木小屋为用户已验收基准；其余为 candidate。完整机器数据在 [manifest.json](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/manifest.json)。

## 可独立放置的 Sprite

尺寸、锚点采用原生像素；占地是当前候选名义网格占地。房屋锚点为前方接地点，其余新物体锚点为模型地面原点，逻辑占地偏移另见清单。

| ID / 名称 | 尺寸 | 锚点 | 占地 | 状态 | PNG | 可编辑工程 |
| --- | --- | --- | --- | --- | --- | --- |
| cabin-terracotta / 暖木小屋 | 96×128 | 48,112 | 3×2 | approved | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/cabin-terracotta.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-blender-experiment/2026-10-13/delivery/cabin-terracotta.blend) |
| oak-broad / 林缘阔冠树 | 96×128 | 48,116 | 2×2 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/oak-broad.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/oak-broad/oak-broad.blend) |
| pine-slender / 高冠青杉 | 80×144 | 40,132 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/pine-slender.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/pine-slender/pine-slender.blend) |
| grass-tuft / 弯叶草丛 | 32×32 | 16,28 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/grass-tuft.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/grass-tuft/grass-tuft.blend) |
| wildflowers / 暖色野花 | 32×48 | 16,42 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/wildflowers.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/wildflowers/wildflowers.blend) |
| bush / 圆叶灌木 | 48×48 | 24,42 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/bush.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/bush/bush.blend) |
| rock / 苔色岩石 | 32×40 | 16,32 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/rock.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/rock/rock.blend) |
| fence-horizontal / 木栅栏·横向 | 64×40 | 32,34 | 2×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/fence-horizontal.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/fence-horizontal/fence-horizontal.blend) |
| fence-vertical / 木栅栏·纵向 | 32×80 | 16,60 | 1×2 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/fence-vertical.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/fence-vertical/fence-vertical.blend) |
| mailbox / 林间信箱 | 40×48 | 20,43 | 1×1 | candidate | [PNG](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/mailbox.png) | [.blend](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2/mailbox/mailbox.blend) |

所有物体使用候选32色色板；原生 Alpha 仅0与255；1px外轮廓。按地面锚点Y排序，再按priority和实例ID稳定排序。每项的实际视觉边界、色数、SHA256、来源脚本、占地偏移、渲染层、制作方法与版本均在 manifest 中。

## 地形

| 类型 | 图块数量 | 规格 | 真实源工程 | 导出 |
| --- | ---: | --- | --- | --- |
| 自然草地 | 8 | 32×32，完全不透明 | terrain-style.json + produce_assets.mjs | terrain-tiles/grass-0.png 至 grass-7.png |
| 泥土/裸地 | 47 | 32×32，标准邻接连接形态 | 同上 + src/growth/homestead/tile-rules.js | terrain-tiles/dirt-<mask>.png |
| 乡间道路 | 49 | 47连接形态 + 2长直路纹理变化 | 同上 | terrain-tiles/path-<mask>.png，path-5-v1/v2.png |

游戏图集：[terrain-atlas.png](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/terrain-atlas.png)，512×224，16列，104个有效32px帧。空白槽不是素材。

源参数：[terrain-style.json](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/terrain-style.json)；逐块PNG目录：`/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/terrain-tiles`。地形源工程是可编辑参数和整数像素构建代码，不是分层像素编辑器工程。

## 脚本及工程记录

- [Blender 建模脚本](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/build_assets.py)：所有新树木、植被和装饰。
- [像素规范化与地形制作](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/produce_assets.mjs)。
- [工程重开与重渲](/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/verify_models.py)。
- [来源说明](/Users/lyc/Desktop/明日复3.0/public/assets/growth-p2-homestead/SOURCE.md)。

新增工程目录：`/Users/lyc/Desktop/明日复3.0/docs/growth-p2-b/2026-10-14/source-models-v2`。每个 ID 子目录包含原生 .blend、原始 native PNG、record.json。首版、失败导出及第一次组装截图全部保留，不覆盖原始木屋。
