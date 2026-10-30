# 信息源目录与订阅核对记录

最后核对：2026年10月31日（北京时间）。本记录区分目录收录授权、官网身份/用途和本次技术访问结果，不把它们混为可靠性排名。

第一版依据站主**明确授权采用的预选候选名单**整理；这不表示站主逐项亲自勾选，也不表示长期阅读偏好。范围为55个预选目录条目与12个预选订阅候选的并集。合并同一BBC的中文与英文要闻后，另加入四个仅在订阅候选中的提供方（中国新闻网、The Guardian、The New York Times、Al Jazeera），共59个目录条目、12个订阅候选，其中11个启用；Nature保留目录但暂不采集。未预选的“站主常看”全部不发布，不猜账号、不代称站主偏好。

## 选取和核对原则

- 一手优先：数据、公告、文件和研究尽量回到原发布者；媒体、社区和专业数据库的角色分别说明，不称“最权威”。
- 推荐句只说明可核实的用途；删去未验证的“收录最多”“报道最扎实”“准确又好读”等评价。搜索缓存与直接可读分开记录。
- 本轮只读官方首页、机构介绍、帮助/订阅文档和官方RSS/Atom，不通过新闻HTML抓取扩充条目，不使用付费API或非官方RSS。
- 本机200仅是一次响应，不保证正文可读、全部功能可用或中国大陆网络可达；403/412、浏览器验证、登录、付费、超时和证书问题如实说明。没有忽略证书验证或绕过登录。
- `approved`表示收录范围已获授权，不表示认可该站每篇内容或保证网络可达。订阅核验不合格应保留目录但`collect=false`，并记录原因，不补进未授权来源凑数。

## 共用配置与历史兼容

`information-sources.json`为目录和当前采集的唯一活配置。各目录条目可有多个官方入口和多个订阅；采集只投影其中启用的feed。旧`news-sources.json`五源冻结为第一轮历史快照/归档的明确映射，不再维护第二份活配置。旧snapshot仍是v1；旧BBC World、Guardian Business及中国新闻网国内源ID只保留作历史兼容。

当前collect_ids为11个活ID；全部approved订阅候选与不重名的旧映射合并后共15个已知来源。Nature仍为approved目录及approved候选feed，但目录与feed的collect均为false；保留其身份用于验证已有快照，不参与fetch。

UN的`un-news-zh`、NASA的`nasa-releases`沿用原name/category/lang及相关字段。新ID区分新栏目，避免把旧源改名冒充新头版。四类继续为domestic/world/economy/science；《The world this week》归world，USGS和Hacker News归science。本轮预选没有经济专类订阅，不把政治头版塞进economy，也不加未选来源补位。每源、每publisher仍有条数上限，最多24条不是每次必须凑足的数量。

## 官方订阅实测

以下表格保留初步通用HTTP请求的观察：日期为响应中观察到的最新日期，不是本站改写的发布时间；条数为当次完整feed观测，实际采集仍受上限限制。请求发生于2026-10-30约17:33—17:36 UTC，即北京时间2026-10-31约01:33—01:36，不承诺今后始终可用，也不能替代生产采集器核验。

**随后2026年10月31日本机生产采集器复核：** `news.fetch_feed`对12个候选中的11个取得HTTP响应。Nature返回303，Location指向`idp.nature.com/authorize`且包含`response_type=cookie`，被既定官方feed域规则正确拒绝；不跟随认证域、不扩大allowlist、不绕过身份cookie。故Nature暂不启用，不能把下表先前的RDF观察写成当前生产采集成功。其余11个的HTTP可获取也不等于每次都有符合显示日期窗口的标题。

| feed ID | 最终订阅URL | 格式 / 当次条数 | 最新原日期（UTC或原日级日期） | 官方订阅说明或来源文档 |
| --- | --- | --- | --- | --- |
| un-news-zh | [订阅](https://news.un.org/feed/subscribe/zh/news/all/rss.xml) | RSS 2.0（gzip） / 30 | 2026-10-30T12:00:00Z | [官方入口](https://news.un.org/zh/rss-feeds) |
| bbc-zh | [订阅](https://feeds.bbci.co.uk/zhongwen/trad/rss.xml) | RSS 2.0 / 38 | 2026-10-30T13:23:25Z | [官方入口](https://www.bbc.co.uk/news/10628494) |
| bbc-top | [订阅](https://feeds.bbci.co.uk/news/rss.xml) | RSS 2.0 / 37 | 2026-10-30T17:25:20Z | [官方入口](https://www.bbc.co.uk/news/10628494) |
| economist-week | [订阅](https://www.economist.com/the-world-this-week/rss.xml) | RSS 2.0 / 300 | 2026-10-29T13:48:04Z | [官方入口](https://www.economist.com/rss) |
| hacker-news | [订阅](https://news.ycombinator.com/rss) | RSS 2.0 / 30 | 2026-10-30T17:03:12Z | [官方入口](https://news.ycombinator.com/newsfaq.html) |
| nature-latest | [订阅](https://www.nature.com/nature.rss) | RSS 1.0 / RDF / 75 | 2026-10-30（仅日期） | [官方入口](https://www.nature.com/nature/web-feeds) |
| nasa-releases | [订阅](https://www.nasa.gov/news-release/feed/) | RSS 2.0 / 10 | 2026-10-30T15:56:26Z | [官方入口](https://www.nasa.gov/rss-feeds/) |
| usgs-significant-week | [订阅](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.atom) | Atom / 4 | 2026-10-30T10:38:47.040000Z（updated） | [官方入口](https://earthquake.usgs.gov/earthquakes/feed/v1.0/) |
| chinanews-top | [订阅](https://www.chinanews.com.cn/rss/importnews.xml) | RSS 2.0 / 30 | 2026-10-30T08:47:56Z | [官方入口](https://www.chinanews.com.cn/rss/) |
| guardian-international | [订阅](https://www.theguardian.com/international/rss) | RSS 2.0 / 109 | 2026-10-30T17:19:01Z | [官方入口](https://www.theguardian.com/help/feeds) |
| nyt-home | [订阅](https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml) | RSS 2.0 / 22 | 2026-10-30T17:19:55Z | [官方入口](https://www.nytimes.com/rss) |
| aljazeera-all | [订阅](https://www.aljazeera.com/xml/rss/all.xml) | RSS 2.0 / 25 | 2026-10-30T17:13:32Z | [官方入口](https://www.aljazeera.com/rss) |

### 订阅性质与特殊情况

- **联合国新闻**：联合国机构新闻，非综合头版；HTTP200仍可能gzip压缩，解压后RSS 2.0共30条。官方订阅说明页本次403。
- **BBC News 中文**：预选simp源实测重定向至此trad源，RSS 2.0共38条；繁体原标题不转简体、不翻译。
- **BBC News · Top stories**：BBC官方Top Stories头版；本次RSS 2.0共37条，官方News feeds说明列出此源。
- **The Economist · The world this week**：每周大事栏目，RSS 2.0共300条且包含多期；按world分类。官方RSS说明页本次403，不声称已读其订阅正文。
- **Hacker News**：社区票选首页RSS 2.0，本次200且30条；条目可直接指向不同作者的公网HTTPS原站，不代表HN编辑核实，本站不抓取外链网页。
- **Nature**：初步通用HTTP曾读到RSS 1.0/RDF共75条，含研究、新闻与更正，非综合头版；dc:date只有YYYY-MM-DD。随后本机生产采集器遇303身份cookie跳转而拒绝，当前collect=false；说明页为浏览器验证。若以后通过原有安全规则恢复，也不虚构精确published或进入精确72小时显示池。
- **NASA**：NASA官方新闻稿专类，非综合头版；RSS 2.0共10条，官方订阅目录列出此源。
- **USGS · Significant earthquakes**：USGS一周显著地震专类Atom，本次4项，updated含小数秒但没有published；updated不当作发表或地震发生时刻。启用的feed仅作archive-only，按缺少完整发布时间的first_seen回退归档，不进入今日72小时池。显著性是来源定义，不是本站添加重大标签。
- **中国新闻网 · 要闻**：官方要闻栏目RSS，不是本站独立重要性评分；本次RSS 2.0，30条，有精确发布时间。
- **The Guardian · International**：国际版头版RSS 2.0共109条；官方说明支持栏目URL添加/rss，不是经济专类。
- **The New York Times · Home Page**：官方订阅目录的Home Page (U.S.)；RSS 2.0共22条，是美国版首页而非经济专类。
- **Al Jazeera**：官方/rss入口本次转向该XML；RSS 2.0共25条，为综合更新，不保证每条是编辑头条。

BBC中文预选请求为`https://feeds.bbci.co.uk/zhongwen/simp/rss.xml`，本次最终URL为`https://feeds.bbci.co.uk/zhongwen/trad/rss.xml`，标题实际为繁体，配置标为zh-Hant，保留原题、不转简体、不翻译。BBC通用News feeds官方说明可读；本轮没有取得可用的中文专用订阅说明，不用猜测地址404冒充文档。

中国新闻网、BBC英文Top、NYT、NASA、USGS的可读官方目录或说明能核对相应订阅；Guardian官方说明支持栏目URL后加`/rss`。Al Jazeera的官方`/rss`入口直接转到XML，未另称存在可读的人类订阅说明。UN说明页本次403，Economist说明页403，Nature说明页为浏览器验证；这些状态没有写成“文档已读”，订阅归属由官方域名、TLS与实际XML对应核对。

Hacker News是**社区投票首页**，不是专业编辑审稿的新闻目录。只有其已明确启用的feed带`link_policy=public-https`，允许保留feed给出的不同作者的安全公网HTTPS原链；`article_hosts`仍用于其官网入口，不放开其他媒体的域名限制。本站只读RSS，不跟随外链抓网页，来源署名不表示HN拥有外站文章或已核实外链标题。

Nature当前不采集。其先前观察到的`dc:date`只有YYYY-MM-DD，相关解析fixture仍须尊重缺少时分秒这一边界：若以后恢复采集，按既有first_seen回退归档，不虚构UTC零点等精确发布时间，不进入要求精确发布时间的72小时显示池。该回退不表示归档schema已新增原始日级发布日期字段。USGS Atom只有updated而无published，继续按发布时间缺失归档，不以更新时刻充当发表或事件发生时间；UN即使请求identity编码仍返回gzip，解析须先按受限大小解压。RSS能读取不代表原文全文免费或免登录。

## 目录逐项入口核对

表中“首页”指目录的公开入口；部分站点另用官方About/帮助核对身份或访问范围。本站两项只核对本地页面。未逐篇核实新闻内容或测试所有交互功能。

| 条目 | 官网或本站入口 | 本次入口观察 | 身份/用途证据与限制 |
| --- | --- | --- | --- |
| 联合国新闻 | [入口](https://news.un.org/zh/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国外交部 | [入口](https://www.mfa.gov.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 路透社 Reuters | [入口](https://www.reuters.com/) | 401 | [官方资料](https://www.thomsonreuters.com/en/about-us/trust-principles)：Thomson Reuters官方原则页可读；Reuters首页本次401。本次自动访问返回401；未核实普通浏览器和不同地区的访问条件。部分内容可能要求账号或订阅，以原站为准。 |
| BBC 新闻（中文与英文要闻） | [入口](https://www.bbc.com/zhongwen/simp) | 200 | 本次官网标识/入口核对；不据此保证全部内容。BBC在部分地区可能受网络限制；本次中文网页与订阅可读不代表中国大陆可达。中文RSS实际为繁体，原题不转换。 |
| 联合早报 | [入口](https://www.zaobao.com.sg/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。部分内容需订阅；本次只核对官网入口，未逐篇测试付费或登录门槛。 |
| 中国政府网 | [入口](https://www.gov.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国人大网 | [入口](http://www.npc.gov.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。HTTP入口可读取；HTTPS升级本次连接失败，保留HTTP官网，不绕过证书验证。 |
| 新华社（新华网） | [入口](https://www.news.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 澎湃新闻 | [入口](https://www.thepaper.cn/) | 403 | 本次官网标识/入口核对；不据此保证全部内容。本次自动访问返回403，未据此断言普通浏览器可用或确定为地区封锁。 |
| 国家统计局 | [入口](https://www.stats.gov.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国人民银行 | [入口](https://www.pbc.gov.cn/) | HTTPS 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 国际货币基金组织 IMF | [入口](https://www.imf.org/) | 403 | [官方资料](https://www.imf.org/en/about)：官方About搜索缓存可读；本机主页403。本次官网自动访问返回403；机构身份另核官方介绍，不声称本机正文通畅。 |
| 财新 | [入口](https://www.caixin.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。部分内容收费或需账号；本次只核对首页，具体权限以原站为准。 |
| 经济学人 The Economist | [入口](https://www.economist.com/) | 403 | 本次官网标识/入口核对；不据此保证全部内容。部分正文需订阅；本次主页及RSS说明页返回403，但官方栏目RSS可解析。 |
| 巨潮资讯网 | [入口](https://www.cninfo.com.cn/) | HTTPS 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国货币网 | [入口](https://www.chinamoney.com.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 美国证监会 EDGAR | [入口](https://www.sec.gov/edgar/search/) | 403 | 本次官网标识/入口核对；不据此保证全部内容。本次入口自动访问返回403；自动请求应遵守SEC公平访问政策，不尝试规避限制。 |
| 财联社 | [入口](https://www.cls.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| arXiv：人工智能新论文 | [入口](https://arxiv.org/list/cs.AI/recent) | 200 | [官方资料](https://info.arxiv.org/about/index.html)：官方About可读；未使用第三方RSS。公开检索；预印本的审稿及发表状态需要逐篇核对。 |
| 模型公司官方发布 | [入口](https://openai.com/news/) | OpenAI 403；其余4入口200 | 本次官网标识/入口核对；不据此保证全部内容。OpenAI新闻入口本次403；其余四个入口可读。DeepSeek链接是API文档，不是模型公告时间线。 |
| 麻省理工科技评论 | [入口](https://www.technologyreview.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。部分文章或服务可能要求订阅；本次未进行付费或登录操作。 |
| 机器之心 | [入口](https://www.jiqizhixin.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。当前首页标题为“机器之心·数据服务”；不把本次落地页说成完整新闻时间线。 |
| Hacker News | [入口](https://news.ycombinator.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| Nature | [入口](https://www.nature.com/) | 200 · Client Challenge；生产feed随后303身份跳转 | 本次官网标识/入口核对；不据此保证全部内容。首页和订阅说明为浏览器验证页；生产feed被固定域规则拒绝，暂不采集，目录保留。初步RDF只给日期，不虚构精确发布时间。 |
| Science | [入口](https://www.science.org/) | 403 | [官方资料](https://www.aaas.org/sites/default/files/2018_AAAS-Brochure_Digital.pdf)：AAAS官方出版资料搜索缓存；Science网页本次403。本次主页和About返回403，未核实正文访问；刊物身份另核AAAS官方出版资料。 |
| NASA | [入口](https://www.nasa.gov/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| Quanta Magazine | [入口](https://www.quantamagazine.org/) | 200 | [官方资料](https://www.quantamagazine.org/about/)：官方About可读。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 知识分子 | [入口](https://www.zhishifenzi.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 世界卫生组织 | [入口](https://www.who.int/zh) | 200 | [官方资料](https://www.who.int/about)：官方机构介绍可读。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 国家卫生健康委员会 | [入口](https://www.nhc.gov.cn/) | HTTPS 412 | 本次官网标识/入口核对；不据此保证全部内容。HTTP和HTTPS入口本次均返回412；保留HTTPS官网，不声称正文已读或其他地区可达。 |
| 中国疾病预防控制中心 | [入口](https://www.chinacdc.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| Cochrane Library | [入口](https://www.cochranelibrary.com/) | 412 | [官方资料](https://help.cochrane.org/kb/article/27-how-can-i-access-cochrane-evidence/)：官方帮助核对摘要免费与全文访问条件。摘要和通俗摘要免费；全文依开放获取、地区或机构许可。主页本次412，官方帮助另行核对。 |
| 默沙东诊疗手册（大众版） | [入口](https://www.msdmanuals.cn/home) | 200 | [官方资料](https://www.msdmanuals.cn/home/resourcespages/about-the-manuals)：官方简介核对免费与无需注册。官方简介说明电子版免费且无需注册；本轮未测试全部工具功能。 |
| 丁香医生 | [入口](https://dxy.com/) | 200 | [官方资料](https://dxy.com/doctor-college/agreement/dxy-doctor.html)：官方协议搜索缓存；首页跳DXY英文集团入口。原地址本次跳到DXY英文集团主页，并非丁香医生科普文章列表；官方协议说明问诊咨询可收费。 |
| 中央气象台 | [入口](https://www.nmc.cn/) | HTTPS 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国地震台网 | [入口](https://news.ceic.ac.cn/) | request-error | 本次官网标识/入口核对；不据此保证全部内容。本次HTTPS证书验证失败，原因为证书过期；未读取正文，不忽略TLS错误或声称访问通畅。 |
| 美国地质调查局地震 | [入口](https://earthquake.usgs.gov/earthquakes/map/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 香港天文台 | [入口](https://www.hko.gov.hk/sc/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 国家法律法规数据库 | [入口](https://flk.npc.gov.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 人民法院案例库 | [入口](https://rmfyalk.court.gov.cn/) | 200 | [官方资料](https://www.court.gov.cn/fabu/xiangqing/431662.html)：最高人民法院官方建设运行规程核对案例库身份。部分检索或服务可能要求注册登录；本次未登录，不声称全部内容免账号可用。 |
| 中国裁判文书网 | [入口](https://wenshu.court.gov.cn/) | 200 | [官方资料](https://www.court.gov.cn/zixun/xiangqing/250581.html)：最高人民法院说明注册登录后查询与下载。检索和下载按平台注册登录要求使用；本次未登录，不绕过验证。 |
| 中国知网 | [入口](https://www.cnki.net/) | 200 · Loading | [官方资料](https://oversea.cnki.net/kns/help/abtcnki.html)：官方About本轮未读取成功；主页重定向后仅Loading。本机跳到oversea.cnki.net且仅显示Loading；未核实全部功能或具体收费范围，保留主域以便站方按地区路由。 |
| 国家哲学社会科学文献中心 | [入口](https://www.ncpssd.cn/) | request-error | [官方资料](https://www.ncpssd.cn/service/guide)：官方指南搜索缓存可读，直接请求超时。本次主页直接读取超时；官方指南说明注册登录流程，不据此声称失效或全站免登录。 |
| Google 学术 | [入口](https://scholar.google.com/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。部分地区可能有网络限制；本机可读不代表中国大陆可达，检索结果不保证全文免费。 |
| Unpaywall | [入口](https://unpaywall.org/) | 200 | [官方资料](https://unpaywall.org/legal/terms-of-service)：官方条款与FAQ搜索缓存核对运营和免费范围。多数功能免费且通常无需注册；主页有JavaScript界面，未做端到端功能测试。 |
| 马克思主义文库（中文） | [入口](https://www.marxists.org/chinese/) | 200 | [官方资料](https://www.marxists.org/admin/intro/index.htm)：文库官方自述可读；不是政府机构身份声明。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 本站「读马恩」 | [入口](/marx/) | 本站路径，未请求远端 | 本次官网标识/入口核对；不据此保证全部内容。本站本地页面；原著外链另受来源网站的访问条件影响。 |
| 中国哲学书电子化计划 | [入口](https://ctext.org/zh) | 200 | [官方资料](https://ctext.org/introduction/zh)：项目介绍可读。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 古登堡计划 Project Gutenberg | [入口](https://www.gutenberg.org/) | 200 | [官方资料](https://www.gutenberg.org/about/)：项目官方About可读；不保证全球公版状态。免费电子书的权利状态以所在地法律为准；不是对所有地区公版状态的保证。 |
| 本站「学英语」 | [入口](/english/) | 本站路径，未请求远端 | 本次官网标识/入口核对；不据此保证全部内容。本站本地页面；阅读标记等保存在当前浏览器。 |
| 剑桥词典 | [入口](https://dictionary.cambridge.org/zhs/) | 200 | [官方资料](https://dictionary.cambridge.org/about.html)：Cambridge University Press官方介绍可读。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 牛津高阶学习词典 | [入口](https://www.oxfordlearnersdictionaries.com/) | 200 | [官方资料](https://www.oxfordlearnersdictionaries.com/about/)：官方About可读。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 中国互联网联合辟谣平台 | [入口](https://www.piyao.org.cn/) | 200 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| 互联网档案馆 Wayback Machine | [入口](https://web.archive.org/) | 200 | [官方资料](https://help.archive.org/help/using-the-wayback-machine/)：Internet Archive官方帮助核对功能和缺档限制。存档可能不完整，部分链接或图片缺失，也可能跳往其他日期；未验证保存等账号功能。 |
| TinEye 以图搜图 | [入口](https://tineye.com/) | 200 | [官方资料](https://help.tineye.com/article/239-is-tineye-free-to-use)：官方帮助核对非商业免费与商业API收费。非商业使用免费，商业API收费；本轮不用该API。最早被发现时间不等于图片首次发布日，结果不授予使用权。 |
| 中国新闻网 | [入口](https://www.chinanews.com.cn/) | 官方订阅/同域feed核对；未另测此首页 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |
| The Guardian | [入口](https://www.theguardian.com/international) | 官方订阅/同域feed核对；未另测此首页 | 本次官网标识/入口核对；不据此保证全部内容。官方RSS及订阅说明本次可读；全文、账号或捐助等条件以原站为准。 |
| The New York Times | [入口](https://www.nytimes.com/) | 官方订阅/同域feed核对；未另测此首页 | 本次官网标识/入口核对；不据此保证全部内容。RSS可读不代表全文免费；部分正文可要求账号或订阅，具体以原站为准。 |
| Al Jazeera | [入口](https://www.aljazeera.com/) | 官方订阅/同域feed核对；未另测此首页 | 本次官网标识/入口核对；不据此保证全部内容。未在中国大陆网络实测，也未逐项测试全部功能；具体登录、订阅与访问条件以原站为准。 |

### 需要保留的边界

- 澎湃403、Reuters401、IMF/SEC/Science403、卫健委412等是本次自动请求结果，不等于已证明地区封锁。SEC自动访问还需遵守其公平访问规则。
- 中国地震台网HTTPS本次因证书过期而校验失败，未读取正文，不改用忽略证书的方式。全国人大入口HTTP可读、HTTPS升级本次失败，保留HTTP；人民银行、巨潮、卫健委、中央气象台的HTTPS另测后采用HTTPS。
- DXY原地址本次转到英文集团主页，故不再把它介绍为直接可读的丁香医生科普文章列表。官方协议能说明相关产品与收费问诊，不表示已测试健康内容的所有登录条件。
- 中国知网本机重定向海外版后只显示Loading，官方About未取得可读正文；不写“检索或下载在所有地区畅通”，也不保留“收录最多”的未核实比较。
- Cochrane摘要和通俗摘要免费，不代表全文全库免费。MSD官方简介说明电子版免费、无需注册；本轮没有为此创建账号。哲社文献中心官方指南有注册登录流程，直接读取超时，不写成全站免登录。
- Unpaywall不保证每篇论文都有免费版本；Wayback可能缺档；TinEye的first found不等于首发时间，搜索到图片不获得使用许可，本轮不使用其商业API。
- 本次没有实测中国大陆网络；对BBC、Google Scholar等的访问提示不构成绕过地区限制的指引。所有费用、注册和地区政策可变，后续复核应更新checked与access，不自动删除记录。

后续若启用定期检查，应只报告链接/订阅状态，不能把一次403或超时直接自动删除，也不能把新增来源自动标成已获站主授权。普通构建和浏览目录不做这些联网核查。
