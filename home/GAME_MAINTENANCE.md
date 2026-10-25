# 小游戏与从夯到拉排行

这是现有静态站点的一部分，无新增生产依赖，也不需要服务端。

## 文件位置

| 内容 | 维护文件 |
| --- | --- |
| 小游戏入口 | `home/game.template.html` |
| 排行工具页面 | `home/ranking.template.html` |
| 首页与全站风格 | `home/assets/portal.css` |
| 排行工具样式、桌面侧栏与展示模式 | `home/assets/game.css` |
| 经典款与科技版皮肤（独立于站点明暗主题） | `home/assets/ranking-skins.css` |
| 编辑、点击选级、Pointer Events 拖动、图片缩放 | `home/assets/ranking.js` |
| 榜单查看缩放、仅看榜单、原生全屏及页面内大屏回退 | `home/assets/ranking-view.js` |
| 本地原图处理、裁切草稿、触屏与键盘定位 | `home/assets/ranking-images.js` |
| 数据模型、默认示例、安全校验 | `home/assets/ranking-model.js` |
| 默认美食及旧图兼容资源 | `home/assets/foods/*.webp` |
| 运动模板的本地 AI 真人照片 | `home/assets/sports/*.webp` |
| IndexedDB 保存与恢复 | `home/assets/ranking-storage.js` |
| PNG 布局与 Canvas 绘制 | `home/assets/ranking-export.js` |
| 构建路由、资源复制和 sitemap | `scripts/build_site.py` |
| 文章导航 | `scripts/build_blog.py` 的 `Blog.document()` |

构建生成 `game/index.html` 与 `game/ranking/index.html`，分别对应 `/game/` 与 `/game/ranking/`。资源复制到 `/assets/`，GitHub Pages 直接提供目录路由；不依赖 SPA 重写或 API。不要编辑 `_site_unified/` 中的生成文件。

`scripts/build_site.py` 的 `GAME_FOOD_ASSETS` 固定列出三十九张食品照片（三十四个当前默认项目及旧火锅、面条、饺子、西瓜、榴莲兼容图），`GAME_SPORT_ASSETS` 固定列出十七张运动照片。源目录分别为 `home/assets/foods/` 和 `home/assets/sports/`，输出到 `/assets/foods/` 与 `/assets/sports/`。生成输出前先验证全部五十六张资源；缺图或目录、文件为链接时会明确失败。照片由本项目经 AI 生成并本地供应，无需联网下载。

## 本地预览与验证

沿用 `blog/requirements.txt` 中现有 Python 依赖，Node.js 用于逻辑测试：

```text
node --test scripts/test_ranking_logic.cjs
node --test scripts/test_ranking_images.cjs
node --test scripts/test_ranking_template_storage.cjs
node --test scripts/test_ranking_dark.cjs
node scripts/test_theme_defaults.cjs
python scripts/test_game_routes.py
python scripts/test_build_site.py
python scripts/test_build_blog.py
python scripts/test_about_routes.py
python scripts/test_image_assets.py
node scripts/test_waline_logic.mjs
node scripts/test_toc_logic.cjs
python scripts/build_site.py --site-url https://xieyuqing.me
python scripts/check_site.py --site-url https://xieyuqing.me
python scripts/test_archive_pages.py
python scripts/preview_site.py
```

手动访问 `http://127.0.0.1:8767/game/ranking/`。预览命令只监听回环地址，不自动打开浏览器。

可选真实浏览器回归：`node scripts/test_ranking_browser.cjs`、`node scripts/test_ranking_advanced.cjs`，缩放、全屏回退、触屏与明暗 PNG 专项为 `node scripts/test_ranking_view_browser.cjs`。测试需要本机已有的 Playwright 与 Chrome/Chromium，可通过 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定，二者不加入站点生产依赖。脚本固定使用独立、无可见窗口的 headless 实例，只访问临时本地 HTTP 服务或拦截供应同一批本地文件，截图与下载证据保存在被 Git 忽略的 `.local-checks/`。

## 交互与本地数据

- 默认五档为“夯、顶级、人上人、NPC、拉完了”，依次使用 `#f28b82`、`#f6b26b`、`#f9d976`、`#e8e5a0`、`#a8cf9a`。默认标题为“美食从夯到拉”，三十四个示例美食使用本地 AI 写实照片，名称可编辑。
- 默认美食顺序：夯：四川火锅、绵阳米粉、嘉兴粽子、东坡肉、海肠捞饭、八珍豆腐、浙江干挑面；顶级：豌杂面、手工水饺、汉堡、日本拉面、越南鸡丝米粉、打抛饭、羊肉烧麦、驴肉火烧、熏肉大饼；人上人：炸鸡、折耳根、速冻水饺、鸡蛋挂面、烧烤；NPC：寿司、豆汁、肉骨茶、北京杂酱面、西湖醋鱼；拉完了：披萨、蛋糕、奶茶、丝瓜面、月饼、蛋挞、面包、兰州拉面。共三十四项，待选区为空；默认不含西瓜、榴莲，旧资源仍保留。默认进入展示模式，点“制作我的榜单”或 Esc 可退出。已有存档优先；仅对 `art: "zhejiang-dry-noodles"` 且名称精确为旧名“（浙江）干挑面”的项目，在读取的新对象中规范为“浙江干挑面”，不回写原记录，不改变图片、裁切、等级或位置。自定义名称和已上传图片的项目保持原样。
- 运动模板标题“运动从夯到拉”：夯＝散步、登山、爬树、打游戏；顶级＝跑步、撸铁、搏斗；人上人＝游泳、羽毛球、自行车；NPC＝乒乓球；拉完了＝足球、网球、跳伞、攀岩、潜水、高尔夫。共十七项，待选区为空。两个默认模板只有上述五档，不另设“拉”档。运动排序只表达个人偏好，不构成健康、训练或客观运动价值评价。
- 默认与恢复默认的项目保存稳定的 `art` 键（如 `sichuan-hotpot`），通过 `RankingModel.BUILTIN_ART` 的 `photo` 字段映射本地照片，不把照片重复嵌进 JSON。旧 `hotpot` 键及照片仍用于旧存档兼容。已有项目的用户 `image` 与 `crop` 始终优先、按原存档恢复，不按名称或 `art` 映射替换用户图片。
- 桌面左榜单、右侧独立滚动待选池；窄屏池在下方。拖动卡片可跨等级移动和同级排序。编辑模式下触屏使用右上角拖动柄，页面其余部分保留滚动；展示模式下可直接拖动整张卡片。
- 编辑模式下单击卡片可改名、选级和前后移动；Tab、Enter 和原生表单控件提供无需拖动的键盘操作。展示模式隐藏卡片编辑、删除、拖动图标及悬浮按钮，单击不打开编辑，双击卡片可编辑，拖拽后不触发双击编辑；手机可双击或退出展示后编辑。每行设置提供改名、颜色、上移、下移、删除；删除等级将项目退回池中。
- 编辑项目时可添加或更换图片、拖动定位、用缩放滑块及方向键微调正方形裁切，重置裁切恢复居中最大正方形；保存才统一提交名称、等级、位置与图片，取消或 Esc 不改变项目。旧未裁切图片保持完整显示，调整后才应用裁切。
- 编辑内置照片时只读取同源固定名单中的本地资源，转为缩放原图与裁切草稿；保存后项目改用 `image/crop` 并清除 `art`，取消则仍保留原本内置照片映射。
- 可从电脑直接拖入多张图片到待选区或某个等级，按文件顺序加入。外部文件拖放由浏览器原生 drag/drop 处理，内部项目排序仍使用 Pointer Events；全页拦截文件 drop，防止浏览器直接打开图片。
- 展示和编辑模式都能通过“模板”选择美食或运动。切换前确认；两份模板内容分别保存在浏览器，首次切换使用目标默认，后续切回恢复各自草稿及皮肤。新模板首次继承当前皮肤。继续编辑前可“撤销切换模板”还原离开时的完整内容；存储不可用时本次内容保留在页面内存并明确提示导出 JSON，刷新可能丢失。目标模板损坏时可再次明确确认，只重建该目标默认；取消则不更改原记录，并继续当前模板原本的自动保存。原 current 损坏时仍保护该记录，目标修复只写自己的归档。
- “恢复默认美食排行 / 恢复默认运动排行”（`#reset-ranking`）只恢复当前模板的标题、五档、项目及其顺序，保留当前皮肤和全站主题，并进入展示模式。确认后继续编辑前可用“撤销恢复默认”还原原内容。切换模板与恢复默认是两个独立操作。
- 「清空全部项目」需要确认，只清空所有等级和待选区的项目，保留标题、等级和皮肤；本页继续编辑前可用同一按钮「撤销清空」。恢复默认与清空只保留最近一次撤销快照，切换皮肤不使其失效，撤销保留当前皮肤；其他内容编辑或导入会取消撤销。快照只在当前页内存中保留，刷新后不会恢复。单项快捷删除有独立确认，不触发排序拖动。
- 经典款使用浅色电子表格式榜单：直角深色外框、清晰横线与等级列竖线、彩色等级标签、浅灰内容行和黑色文字；图片及名称紧凑齐列，无独立卡片圆角或阴影。科技版沿用本站绿色点缀和现代圆角；排行皮肤写入存档，与站点顶部的明暗切换独立，两种皮肤均可编辑、展示和导出。
- 全站主题优先读取用户已保存的浅色/深色选择，否则跟随系统；无检测能力时默认为浅色。没有显式偏好时系统变化会同步，有显式选择则保持。经典款浅色模式为米白背景、浅灰表格、深色文字和网格；深色模式为黑色页面与承载背景、深灰内容区、浅色文字和清晰灰色网格，彩色等级标签根据自身亮度选字色。经典 PNG 按导出时当前主题使用对应配色；皮肤与站点主题仍是独立选择，科技版原有导出样式不变。
- 查看工具栏提供 75–200% 缩放、还原 100% 和适应宽度；只有标题和完整榜单随查看比例缩放，工具栏、编辑弹窗与导出清晰度不变。放大后可横向或纵向滚动查看所有行，拖动仍使用视口坐标命中，并支持榜单滚动区边缘自动滚动。触屏从等级标签或空白处滑动，整卡拖动和双点编辑仍可用。
- “仅看榜单”临时隐藏候选区并扩宽榜单，不删除候选内容；非空时显示剩余项目数和恢复入口，返回编辑会恢复候选区。“全屏查看”仅在用户点击时申请标准 Fullscreen API；不可用或被拒绝时进入页面内大屏并明确提示。退出按钮和 Esc 可返回，编辑按钮始终保留；原生全屏及页面内大屏不修改浏览器安全设置。缩放、仅看榜单和全屏均不写入排行数据或撤销记录，PNG 始终从完整数据独立绘制，不按屏幕截图或滚动位置裁切。
- 顶部标题可编辑并自动换行；空标题恢复上次有效值。展示模式隐藏多余控件，保留标题、榜单和池，退出按钮与 Esc 可退出。入口及编辑模式介绍为“供大家娱乐，也欢迎制作自己的「从夯到拉」排行榜，自由添加图片、调整等级，并下载、保存和展示。”，展示模式和 PNG 不含介绍。没有广告、外部服务或强制水印。
- 排行存入当前站点、当前浏览器的 IndexedDB；图片不上传。切换域名、设备或清理浏览器数据不会保留这些存档。多标签页最后写入者生效。
- 自动保存使用排队事务与短暂防抖，只有事务成功才显示已保存。额度不足、权限拒绝、损坏或被旧标签页占用均有提示；重要内容请用 JSON 备份。损坏的原记录保留，直到用户确认导入替换或重置。
- JSON v3 为 `{version:3,templateId,title,skin,rows,pool,items}`；项目保存 `image`（唯一归一化原图）、`crop`（null 完整显示，或原图像素坐标 `{x,y,size}`）、原有名称和 `art`。严格兼容 v1/v2：只在内存迁移为 v3 与 `templateId:"food"`，保留原等级、项目、名称、用户图和裁切，不自动补新默认；读取时不回写。数据库仍为 `xieyuqing-ranking-v1`、对象仓库 `rankings`。`current` 保存最近选择，`template:food`、`template:sport` 分别保存各模板草稿；保存用同一事务写当前与对应草稿，失败不产生半份记录。JSON 导出当前模板，导入时按 `templateId` 还原；旧备份按美食读取。严格校验字段、模板 id、引用、容量、图片和裁切边界，不允许远程 URL、用户 SVG 或 HTML 执行。 跨模板导入前先归档当前内容；归档失败会中止导入，避免旧版仅 current 的内容被覆盖。`saveTemplate(state)` 仅写指定模板归档，不改变 current，用于目标修复和切换撤销的离开归档。

## 安全和资源边界

当前上限为 20 档、200 项；标题 100 字符，等级名 30 字符，项目名 80 字符。原图只接受 PNG/JPEG/WebP，每张最多 10 MiB；先检查文件头与尺寸，拒绝超过 3200 万像素或任一边 12000 像素的原图，再缩至最长边 1024 像素。保存图片每张最多 1 MiB，总图片 20 MiB；导入、添加和更新均检查累计 6400 万解码像素上限，防止高压缩大图耗尽内存。只保存一份原图与裁切坐标，再次裁切不重复压缩；卡片与 PNG 从相同源矩形绘制。JSON 最多 30 MiB。动画 WebP 提示先转换为静态图。

PNG 由校验后的 state 直接绘制，只包括标题和所有等级中的项目，不包括待选池、编辑按钮或水印。界面和导出已移除「个人偏好 · 随心排一排」字幕。使用本地字体，等待字体就绪和每张图片解码，项目与等级名称逐字换行，行高按最长内容计算。输出默认 1200 逻辑像素宽，可选 1×/2×；最多 1600 万像素、单边 16000 像素，长图自动降低倍率，低于 0.5× 时明确拒绝以免不可读或内存溢出。编码、解码和字体等待有超时及错误信息。

本功能代码独立实现，未复制第三方排行项目或引入运行库。默认美食使用固定本地 AI 写实照片；入口装饰 SVG 为自制。若以后供应第三方库，应固定本地版本并保留其许可证。

## 展示入口与导航

默认展示模式保留无编辑图标的榜单；「制作我的榜单」进入现有编辑模式，Esc 与双击卡片仍可进入编辑。按钮的可访问名称明确说明模式变化；切回展示时恢复此入口。「返回小游戏」为始终可用的轻量返回链接，全屏查看仍保留它与退出控制。工具栏可换行，页面水平滚动只限放大后的榜单区域。页面头部在编辑模式使用与全站一致的品牌及七个栏目链接；默认展示和直播视图继续隐藏页头页尾。

游戏入口与排行页使用共享 `/assets/share-cover.png` 和 SVG favicon；修改不改变 IndexedDB、用户存档、PNG 输出或默认示例内容。

手机专项可重跑：`node scripts/test_ranking_mobile.cjs _site_unified .local-checks/ranking-mobile-final --strict`。覆盖 320/360/390/430 竖屏、对应横屏与 DPR 2/3、CDP 触摸滚动/排序、两皮肤矮视口弹窗、44px 命中区、无拖动选级、故障注入与恢复。修改前冻结证据保存在 `.local-checks/ranking-mobile-before-site/` 与相应 before 报告目录，后续构建不覆盖。

## 手机操作

手机展示默认允许从卡片起手横向或纵向滑动查看；点「拖动排序」临时启用整卡拖拽，点「结束拖动」恢复滚动。状态提示与 `aria-pressed` 同步，开关不进入 JSON、IndexedDB 或 PNG。进入编辑时自动恢复滚动；手机可用「制作我的榜单」后单击卡片、选择等级并保存，无需双击或拖动。桌面整卡拖拽及双击编辑保持原样。

手机关键按钮与拖动柄至少 44×44 CSS 像素；拖动柄图形及经典表格卡片尺寸保持原样，快捷删除隐藏后仍可从编辑弹窗删除。实际表单输入至少 16px，矮视口弹窗可滚动并可取消。大屏工具条考虑浏览器提供的顶部安全区；不把 CSS 处理或缩小视口测试当作真实刘海屏、系统软键盘验收。

PNG 编码或文件下载 API 缺失时给出中文提示，恢复 API 后可继续下载，默认 anchor download 不依赖系统文件选择 API。自动化下载验证只证明隔离 Chromium 生成了有效文件，不代表真实手机系统保存成功。

## 发布前人工验收

在真实手机上检查触屏拖动、滚动与系统下载行为；在计划使用的直播尺寸中检查展示模式、长标题与侧栏；核对真实用户图片的方向、透明背景与导出清晰度。自动化的触屏模拟与 PNG 下载检查不能完全代替各设备原生体验。检查 Git diff 后由用户决定提交、推送和上线。

旧六档或自定义存档仍作为用户数据完整保留，不自动删行、合并或重命名；只有明确恢复当前模板默认才重建上述五档。


## 中英界面与存档边界（2026-10-23）

入口和排行各有 `/game/`、`/game/ranking/` 及对应 `/en/game/`、`/en/game/ranking/`。两语共用同一套模板和 `ranking*.js`，由 `scripts/site_i18n.py` 加载 `home/locales/games.json`、生成首屏与双语 SEO，并在游戏模块之前加载共享 `SiteI18n`。四个页面元数据键固定为 `games.page.game.title/description` 与 `games.page.ranking.title/description`。正文的内部游戏链接标记 `data-i18n-link`，随当前语言更新。

`games.json` 为两语平铺 catalogue。静态文本使用 text-only `data-i18n` span，aria/title/placeholder 使用对应属性标记。动态消息由 `RankingModel.translate/localize/uiText/uiAttr` 通过共享 `SiteI18n.t` 显示；UI_KEYS 将现有中文消息映射到稳定 catalogue key，含参数的消息保持 `{name}` 等占位符。新增消息须同时补两语 catalogue 与 UI_KEYS；不要直接翻译用户输入。内部模型与存储异常的原文仍保留，展示时翻译，嵌套校验详情也会转换。

语言切换通过共享 history API 原地完成，不执行 render、不重建编辑器、不触发保存，不关闭弹窗或取消图片读取。动态消息保留原消息，往返切换可恢复中文；已有卡片与等级节点仅更新展示文字和可访问名称。聚焦或已修改的名称/标题输入保留草稿；裁切、缩放、选级、焦点和撤销快照不变。语言变化不调用图片编辑器的 open/close。

默认项目的英文展示同时要求稳定 `food-`/`sport-` ID、对应资源身份与精确原名称；新建 custom ID 即使沿用同名内置图，也保留用户名称。默认等级同样按稳定 ID 和原名识别。替换默认图片后仍可识别原身份；自定义改名不再翻译。标题、等级和项目使用 display helpers；未改动的英文输入通过绑定还原原始中文值后提交。PNG 使用校验后的独立 clone 展示投影，JSON 与 IndexedDB 始终保存原 state。JSON v1/v2/v3 兼容逻辑、IndexedDB `xieyuqing-ranking-v1`、`rankings`、`current`、`template:food` 与 `template:sport` 均不变，未修改 `ranking-storage.js`。默认名称和用户中文内容不会因切换语言写成英文。

专项逻辑回归：

```text
node --test scripts/test_ranking_logic.cjs scripts/test_ranking_images.cjs scripts/test_ranking_template_storage.cjs scripts/test_ranking_dark.cjs scripts/test_ranking_i18n.cjs
```

可选独立浏览器回归（使用已有 Playwright/Chrome，不加生产依赖）：

```text
node scripts/test_ranking_i18n_browser.cjs _site_unified .local-checks/ranking-i18n
```

该脚本拦截供应本地页面与资源，固定使用全新非持久化 headless 上下文。测试库中的旧版及损坏存档都是人工测试数据，不访问真实浏览器档案。覆盖重复切换不 reload/不写存档、开放图片草稿取消、同名 custom、新旧名称保存、quota 失败后恢复、模板取消及切换后撤销、查看模式、JSON/PNG、v2 原始字节只读、损坏记录保护和 390px 手机布局。入口英文扫描允许语言切换按钮使用原生标签“中文”。

在受限执行环境中，浏览器可能将原生下载报告为 canceled；必须如实记录，不把 Blob 生成当作实际下载成功。当前专项在正常审查后的隔离本地执行中验证了有效 JSON 与 PNG 原生下载。模拟手机不代表真实软键盘、设备系统保存或原生全屏授权；这些仍需人工验收。全站构建、CI 与发布由主任务统一执行。

## 足迹制作入口（2026-10-25）

小游戏现在同时提供从夯到拉和“制作我的足迹地图”。地图工具路由为 `/game/footprints/` 与 `/en/game/footprints/`，从空白访客草稿开始，与作者 `/map/` 展示隔离。工具使用浏览器本地的手动保存/恢复；刷新后不会把访客记录展示到作者地图。完整数据、媒体和测试说明见 `blog/足迹地图维护.md`。
