# 素材来源

获取日期：2026-11-18；新增四张美术图于 2026-11-20 获取。GTA VI 背景与标志直接取自 Rockstar Games 官网。

官方素材库：https://www.rockstargames.com/VI/media/artwork-wallpapers

| 本地文件 | 官方名称 | 原始素材地址 |
| --- | --- | --- |
| images/jason-lucia.jpg | 杰森与露西娅01，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_and_Lucia_01_landscape.12x2gvspcm_3m.jpg |
| images/beach.jpg | 杰森与露西娅沙滩，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_and_Lucia_Beach_landscape.0419q._86ukpt.jpg |
| images/rooftop.jpg | 杰森与露西娅屋顶，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_Lucia_Rooftop_landscape.0c6p5do~-8~7..jpg |
| images/vice-city.jpg | 罪恶城明信片，横版 | https://www.rockstargames.com/VI/_next/static/media/Vice_City_Postcard_landscape.0v2njmlk2n-qm.jpg |
| images/duo-02.original.jpg | 杰森与露西娅02，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_and_Lucia_02_landscape.0cosv-uzbpt91.jpg |
| images/lock-load.original.jpg | 杰森与露西娅整装待发，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_Lucia_Lock_And_Load_landscape.0l9s5w7ih9p~3.jpg |
| images/robbery.original.jpg | 杰森与露西娅进行抢劫，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_and_Lucia_Robbery_landscape.09c8a~do21h4p.jpg |
| images/motel.original.jpg | 杰森与露西娅汽车旅馆，无徽标横版 | https://www.rockstargames.com/VI/_next/static/media/Jason_and_Lucia_Motel_landscape.08edvuwtm-20v.jpg |
| images/gta-vi.png | 官网独立 GTA VI 标志 | https://www.rockstargames.com/VI/_next/static/media/vi.0hxa9~pf214xe.png |

美术、人物与 GTA 标志的权利归相应权利人所有。本项目为非官方娱乐概念演示，不代表 Rockstar Games 发布的移动版游戏。微信、QQ 图标为内联图形，仅表达模拟入口，不接入真实平台。

## 派生优化版本

当前七张背景由原图生成到 `assets/backgrounds/`。`vice-city` 明信片已从轮播、预加载和设置中移除，旧文件仅作历史素材保留；`images/` 中旧版 WebP 不再用于当前页面。

- `*.1280.webp`、`*.1600.webp`、`*.1920.webp`：等比例缩放，WebP 质量 82。根据首次打开时视口长边选择一档，不按高像素密度加载原始 4K 图；旋转不重复下载另一档。
- `*.fallback.jpg`：1600px JPEG，质量 82、渐进加载；不支持 WebP 或 WebP 失败时使用，避免加载完整原图。
- `*.thumb.jpg`：独立 320 × 180 JPEG，质量 76，仅用于设置缩略图。
- 生成脚本：`tools/prepare-assets.py`，需要 Pillow，仅用于开发，页面运行无需 Python 或任何依赖。
- 运行时首图优先、下一张逐张准备，下载及解码完成后挂入隐藏图层；失败图片有限重试，网络恢复或手动点击可重新尝试。

## 页面文案

`images/age-12.svg` 参照用户提供的王者荣耀登录页截图，以本地矢量图重绘蓝色“12+ / CADPA / 适龄提示”外观。此图仅为概念界面装饰，不表示 GTA VI 获得了该适龄分级或 CADPA 认证。

页脚“美国阳光最盛之处，亦有最阴暗的一面。”引用自 [GTA VI 官方中文首页](https://www.rockstargames.com/VI)“人物与地点”介绍（2026-11-18 核对）。移除原先自拟的“阳光之下／故事开始”和英文页脚，主画面不再放置大字标语。横屏手机隐藏页脚引文，避免与背景信息拥挤。

## 后续视频背景候选

官方封面动画：https://media-rockstargames-com.akamaized.net/VI/downloads/videos/GTAVI_Official_Cover_Art_Landscape/GTAVI_Official_Cover_Art_Landscape.mp4

初版不加载该视频。后续接入时，应先检查内容并剪出适合驻留和循环的片段，保留图片作为加载与失败兜底。
