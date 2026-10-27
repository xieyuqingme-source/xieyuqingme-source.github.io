# 首页素材与数据

- `home-ink.webp`：为本站生成的装饰性水墨山景，用作刊头背景，不作为真实地点或新闻配图。
- 首页永定河照片来自既有公开摄影目录 `photos/catalog.json`，作品卡片来自本站既有作品截图。首页不要求以后文章统一配图风格。
- `vendor/d3-7.9.0.min.js`：D3 v7.9.0 本地副本，来自 npm 官方发布包（jsDelivr 分发）；ISC 许可证见同目录 `D3-LICENSE`。
- 地球陆地几何使用既有 `map-land.json`（Natural Earth），其他归属见 `map/THIRD_PARTY_NOTICES.md`。
- 天文算法：`astronomy-solar.js` 采用 NOAA/Meeus 太阳位置近似计算，太阳视半径及折射日出阈值 −0.833°。日出日落不计实际地形与局部气象，屏幕中的地球投影不代表黄赤交角的直接测量。
- 天气：用户选择城市后向 Open-Meteo 查询，不请求访客定位。仅在本地保存城市选择及 30 分钟天气缓存；显示数据时间和来源，失败时显示不可用或有时间标记的旧缓存。免费端点适用于当前非商业个人网站，商业化前重新核对服务条件。
- 新闻：`home/brief/news/YYYY-MM-DD.json` 保存人工挑选的每日版本，首页使用日期最新的 v2 文件，保留原文时间与直达链接。尚未实现自动采集。`home/daily-content.json` 仅保留每日名言；每日小知识、热梗与天气提示规则位于 `home/brief/`，格式与更新流程见 `blog/今日简报维护.md`。

## 2026-10-27 历法与假日来源

- `vendor/lunar-javascript-1.7.7.js`：来自官方 npm `lunar-javascript@1.7.7` 发布包中的 `package/lunar.js`，下载时核对 npm 发布信息中的 SHA-512 完整性值，保留原始字节。项目：<https://github.com/6tail/lunar-javascript>。MIT 许可证原文保存在 `vendor/lunar-javascript-1.7.7.LICENSE`。源码 SHA-256：`9750324bfe1aa63c146f8c72b1143df924466c11c8a5277d7d9225c541a18aaa`。
- `home/brief/holidays/2026.json`：来自 <https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json>，保留原始字节与文件中列出的国务院公告来源。项目：<https://github.com/NateScarlet/holiday-cn>。MIT 许可证保存在该目录的 `LICENSE`。数据 SHA-256：`0dcfd8004351e132ce15e8444de4df123265b3f490f7e2f8346631122cb5b709`。
- 下载时上游 `2027.json` 的 `papers`、`days` 都为空，故没有将空文件当作已公布的 2027 年调休数据。之后按维护说明核实公布状态再加入。
- 上述依赖均随静态站点发布。lunar-javascript 只在简报展开后加载；D3、地球脚本与几何数据只在简报展开且地球区域可见时加载。运行时不访问 CDN。黄历内容注明「传统民俗，仅供一乐」与「据 lunar-javascript 推算」。
- 月相名称采用平均朔望月周期的本地近似公式，周期依据见 [NASA](https://eclipse.gsfc.nasa.gov/SEhelp/moonorbit.html)；日出日落与昼夜判断继续使用本站太阳几何算法。天气日最高/最低温度及降雨概率复用原有 Open-Meteo 请求，不增加天气请求次数。
