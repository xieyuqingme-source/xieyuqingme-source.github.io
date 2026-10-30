# 学英语小测验：知识题来源

更新核对日期：2026-10-30。知识题共40道：真假词源与来源语言各12道，新增用法选择16道。题干、干扰选项和解释为编写内容，整理与措辞有 AI 辅助；来源链接指向相应知识卡已经列明的材料。旧24题保留原核对记录；新增用法题所用的原卡Cambridge来源已再次核读。

## 数据与派生规则

- `quiz.json` 维护知识题及可选`warmup_quotes`手选ID，不复制英语名句或作者题。每题必须指向已发布卡片，来源 URL 必须属于该卡。
- 真假词源的选项固定为真、假、存疑、部分正确；浏览器可以重新排列呈现。证据不足的说法保留“存疑”，不把词源争议强行判成唯一来源。
- 来源语言题定位一个明确词形或传播阶段。祖先形式、中转形式与现代英语形式不是同一个问题；例如 ketchup 题干保留“可能中介”的限定。
- 作者题只从 `home/brief/english-quotes.json` 派生，使用其中同一条原文、译文、出处和阅读提示。干扰项优先按作者卒年接近选择；若三位都未落入手选易认作者范围，则将距离最远的一位换为最近的易认作者。至少保留两位接近时代的干扰项，全部作者均来自真实共享库；后出的选集、节录或修订版年份不用于移动作者时代。
- 用法题为两至三个选项，必须指向已发布的“别说错”卡片，场景和要表达的意思写清楚，每题只有一个符合该目标的答案。
- 默认先玩来源语言。作者题每轮前三题从手选句子中抽取三位不同作者，其他题也尽量跨作者；可以在作答前查看中文或作品/所引版本年份提示。使用帮助不扣分，帮助记录只存在本轮内存，在结束回顾中标注。
- 作者题优先链接该名句已经关联的卡片，否则链接名句库中该句的锚点。不凭空添加核对日期，也不另编第二套名句。
- 构建只读取仓库资料，不请求词典或作品网站。外部来源由读者自行点击。

## 真假词源题核对

| id | 核对重点 | 对应材料 |
| --- | --- | --- |
| `etym-ketchup-tomato` | 早期配方不只番茄，不能将现代默认义当作全部历史。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/ketchup)、[Etymonline](https://www.etymonline.com/word/ketchup) |
| `etym-tea-sea-land` | 贸易联系有依据，葡萄牙语 chá 却是海陆口诀的例外。 | [WALS 第138章](https://wals.info/chapter/138) |
| `etym-gung-ho-cooperative` | 中国工业合作社简称与后来美军口号的联系。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/gung%20ho) |
| `etym-kowtow-literal` | 保留实际跪拜义，也有迎合权势的比喻义。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/kowtow) |
| `etym-tycoon-new-field` | 政治称谓与后来的商业大亨义。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/tycoon)、[Etymonline](https://www.etymonline.com/word/tycoon) |
| `etym-amok-running` | 固定搭配的整体用法，不能逐字拆成实际跑步。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/amok) |
| `etym-serendipity-luck` | 不经意发现有价值之物，比笼统的幸运更具体。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/serendipity) |
| `etym-long-time-no-see-route` | 汉英及北美接触线索不等于已经证明唯一路线。 | [David Crystal 本人文章](https://david-crystal.blogspot.com/2010/07/on-long-time-no-see.html) |
| `etym-sos-backronym` | 字母选择与摩尔斯码易发易认有关，英语展开式是民间词源。 | [Oxford Learner's Dictionaries](https://www.oxfordlearnersdictionaries.com/definition/english/sos) |
| `etym-posh-cabins` | 来源仍不明，常见船舱首字母说缺少证据。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/posh)、[Etymonline](https://www.etymonline.com/word/posh) |
| `etym-ok-election` | 1839文字记录早于1840竞选使用，传播不等于创造。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/OK)、[Cambridge Dictionary Blog](https://dictionaryblog.cambridge.org/2011/02/11/its-all-ok/) |
| `etym-salary-salt-pay` | 盐的词族关系有据，具体军饷发放制度不能由词根直接推出。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/salary) |

## 来源语言题核对

| id | 定位的形式或阶段 | 对应材料 |
| --- | --- | --- |
| `origin-ketchup-min` | kôe-chiap / kê-chiap：闽南语祖先形式。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/ketchup) |
| `origin-ketchup-possible-malay` | kecap：马来语可能中介，未断言所有路线必经此处。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/ketchup) |
| `origin-tea-dutch-stage` | thee：荷兰语中转形式。 | [WALS 第138章](https://wals.info/chapter/138) |
| `origin-tea-min-stage` | te 一系：闽南语阶段。 | [WALS 第138章](https://wals.info/chapter/138) |
| `origin-portuguese-cha` | 葡萄牙语 chá 所联系的粤语 cha。 | [WALS 第138章](https://wals.info/chapter/138) |
| `origin-gung-ho-chinese` | 工合：汉语简称。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/gung%20ho) |
| `origin-kowtow-chinese` | kòutóu：汉语来源形式。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/kowtow) |
| `origin-tycoon-japanese` | taikun：日语称谓，不因使用汉字就跳过日语。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/tycoon) |
| `origin-amok-malay` | amok 的名词借词来源：马来语。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/amok) |
| `origin-wednesday-old-english` | wōdnesdæg：古英语阶段。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/Wednesday) |
| `origin-september-septem` | septem：表示七的拉丁语数词。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/September) |
| `origin-salary-salarium` | salarium：拉丁语祖先形式，后有法语、英语阶段。 | [Merriam-Webster](https://www.merriam-webster.com/dictionary/salary) |

## 未采用的出题方式

- 不把 long time no see 的唯一来源语言设为确定答案。
- 不把 ketchup 的马来语中介从“可能”改成“必然”。
- 不给 Serendip 的复杂地名来源硬选一种唯一语言。
- 不把 posh 的船舱故事或其他候选词源包装成已证明结论。
- 不由 salary 与盐的词形联系编造古罗马军饷细节。
- 不把来源页面的读者留言、自动聚合新闻例句或未经核对的名人传闻当作依据。

## 维护接口

`scripts/english_quiz.py` 提供：

- `validate_quiz(data, cards)`：严格校验版本、题目字段、唯一选项、答案、已发布卡片、真实来源归属和公开文本/链接边界；原词源/来源题仍为四选项，用法题为两至三个，且须来自别说错卡，返回独立复制的题目数组。
- `load_quiz(root, cards)`：只读仓库中显式的 `english-corner/quiz.json`，返回同样的已校验数组。
- `load_quiz_options(root)`：返回可选的手选名句ID数组，旧清单/小夹具没有该字段时返回空数组。
- `build_quiz_pools(english_quotes, knowledge, warmup_quotes=())`：名句可传版本1包装对象或其中的quotes数组，knowledge使用上一步的数组；输出origins、etymology、usage、authors四池。手选ID须属于实际共享库且覆盖至少三位作者；此检查在写输出前完成。小型测试不足四位作者时，作者池为空，不捏造作者。

`scripts/test_english_quiz.py`核对schema、非法私有链接、来源归属、用法题类型、手选ID与跨作者范围、兼顾熟悉作者和时代的干扰项、共用原文及换行、生产数量。通用校验允许空知识题和无手选列表的小型fixture；生产inventory要求40题以上，三类知识模式各至少10题。

## 手选入门句子

手选属于编辑分类，不是知名度排名；只登记共享ID。作品/所引版本年份用于提示位置，不一律称为原作写作年或首刊年。

| 共享ID | 作者 | 作品/所引版本 | 年份 |
| --- | --- | --- | --- |
| `shakespeare-04` | 莎士比亚 | 《威尼斯商人》 | 1600 |
| `dickens-01` | 查尔斯·狄更斯 | 《双城记》 | 1859 |
| `austen-06` | 简·奥斯汀 | 《傲慢与偏见》 | 1813 |
| `shelley-01` | 珀西·比希·雪莱 | 《雪莱诗集》第二卷 | 1820 |
| `wordsworth-01` | 威廉·华兹华斯 | 《诗二卷集》第二卷 | 1807 |
| `bronte-01` | 夏洛蒂·勃朗特 | 《简·爱》 | 1847 |
| `wilde-03` | 奥斯卡·王尔德 | 《道林·格雷的画像》 | 1891 |
| `melville-01` | 赫尔曼·梅尔维尔 | 《白鲸》 | 1851 |

## 用法选择题核对

所有场景和备选句为编写内容，不复制学习词典的题目。每张原有别说错卡派生两题，详见所链用法说明。

| id | 目标场景 | 卡片 | 词典依据 |
| --- | --- | --- | --- |
| `usage-very-like-verb` | 想说“很喜欢这个结尾”，哪句是标准而自然的说法？ | [very-like](/english/very-like/) | [Cambridge English Grammar Today：Like](https://dictionary.cambridge.org/grammar/british-grammar/like)、[Cambridge English Grammar Today：Very](https://dictionary.cambridge.org/us/grammar/british-grammar/very)、[Cambridge Dictionary：really](https://dictionary.cambridge.org/us/dictionary/essential-american-english/really) |
| `usage-very-like-position` | 想说“非常喜欢这座城市”，哪句的程度词位置合适？ | [very-like](/english/very-like/) | [Cambridge English Grammar Today：Like](https://dictionary.cambridge.org/grammar/british-grammar/like)、[Cambridge English Grammar Today：Very](https://dictionary.cambridge.org/us/grammar/british-grammar/very)、[Cambridge Dictionary：really](https://dictionary.cambridge.org/us/dictionary/essential-american-english/really) |
| `usage-light-power` | 房间暗了，想请人按开关让台灯发光。哪句表达了这个动作？ | [turn-on-light](/english/turn-on-light/) | [Cambridge Learner's Dictionary：switch (sth) on](https://dictionary.cambridge.org/dictionary/learner-english/switch-sth-on)、[Cambridge English–Malay Dictionary：switch on/off](https://dictionary.cambridge.org/us/dictionary/english-malaysian/switch-on-off) |
| `usage-light-off` | 离开房间前，想请人按开关让台灯熄灭。哪句表达了这个动作？ | [turn-on-light](/english/turn-on-light/) | [Cambridge Learner's Dictionary：switch (sth) on](https://dictionary.cambridge.org/dictionary/learner-english/switch-sth-on)、[Cambridge English–Malay Dictionary：switch on/off](https://dictionary.cambridge.org/us/dictionary/english-malaysian/switch-on-off) |
| `usage-bored-feeling` | 火车晚点，等车的人觉得无聊。哪句表达的是等车人的感受？ | [bored-boring](/english/bored-boring/) | [Cambridge English Grammar Today：bored or boring](https://dictionary.cambridge.org/grammar/british-grammar/word-choice-bored-or-boring) |
| `usage-boring-cause` | 想说“这个故事令人无聊”，哪句符合所要表达的意思？ | [bored-boring](/english/bored-boring/) | [Cambridge English Grammar Today：bored or boring](https://dictionary.cambridge.org/grammar/british-grammar/word-choice-bored-or-boring) |
| `usage-discuss-object` | 想提议“讨论一下明天的计划”，哪句搭配正确？ | [discuss-about](/english/discuss-about/) | [Cambridge English Grammar Today：About](https://dictionary.cambridge.org/us/grammar/british-grammar/about)、[Cambridge English Grammar Today：Verb patterns, with and without objects](https://dictionary.cambridge.org/grammar/british-grammar/verb-patterns-with-and-without-objects) |
| `usage-discuss-person` | 想问“能和你讨论一下路线吗”，哪句把讨论对象和参与者放对了？ | [discuss-about](/english/discuss-about/) | [Cambridge English Grammar Today：About](https://dictionary.cambridge.org/us/grammar/british-grammar/about)、[Cambridge English Grammar Today：Verb patterns, with and without objects](https://dictionary.cambridge.org/grammar/british-grammar/verb-patterns-with-and-without-objects) |
| `usage-news-unit` | 想说“有一条好消息”，哪句符合 news 的常用语法？ | [good-news](/english/good-news/) | [Cambridge English Grammar Today：News](https://dictionary.cambridge.org/grammar/british-grammar/news) |
| `usage-news-agreement` | 把 news 作主语，哪句的谓语形式正确？ | [good-news](/english/good-news/) | [Cambridge English Grammar Today：News](https://dictionary.cambridge.org/grammar/british-grammar/news) |
| `usage-how-direct-question` | 直接向别人询问“这个词用英语怎么说”，哪句是完整的标准问句？ | [how-do-you-say](/english/how-do-you-say/) | [Cambridge English Grammar Today：Word order, how](https://dictionary.cambridge.org/us/grammar/british-grammar/word-order-how)、[Cambridge English Grammar Today：Questions, typical errors](https://dictionary.cambridge.org/uk/grammar/british-grammar/questions-typical-errors)、[Cambridge Dictionary：how](https://dictionary.cambridge.org/us/dictionary/english/how) |
| `usage-how-embedded` | 表达“不知道怎样描述它”，哪句适合接在 I don’t know 后面？ | [how-do-you-say](/english/how-do-you-say/) | [Cambridge English Grammar Today：Word order, how](https://dictionary.cambridge.org/us/grammar/british-grammar/word-order-how)、[Cambridge English Grammar Today：Questions, typical errors](https://dictionary.cambridge.org/uk/grammar/british-grammar/questions-typical-errors)、[Cambridge Dictionary：how](https://dictionary.cambridge.org/us/dictionary/english/how) |
| `usage-computer-game` | “大家晚饭后玩电脑游戏”，哪句把实际活动说完整了？ | [play-computer-games](/english/play-computer-games/) | [Cambridge Dictionary：game](https://dictionary.cambridge.org/dictionary/english/game)、[Cambridge University Press：Step Up to IELTS 官方摘页](https://assets.cambridge.org/97805215/32983/excerpt/9780521532983_excerpt.pdf) |
| `usage-computer-use` | 现在只想说“用电脑写邮件”，哪句符合这个场景？ | [play-computer-games](/english/play-computer-games/) | [Cambridge Dictionary：game](https://dictionary.cambridge.org/dictionary/english/game)、[Cambridge University Press：Step Up to IELTS 官方摘页](https://assets.cambridge.org/97805215/32983/excerpt/9780521532983_excerpt.pdf) |
| `usage-forward-action` | 想说“期待与大家见面”，哪句接在 look forward to 后的形式合适？ | [look-forward-to](/english/look-forward-to/) | [Cambridge English Grammar Today：Look forward to](https://dictionary.cambridge.org/grammar/british-grammar/look-forward-to)、[Cambridge Dictionary：look forward to something](https://dictionary.cambridge.org/dictionary/english/look-forward-to) |
| `usage-forward-noun` | 想表达“期待这次假期”，哪句的介词搭配正确？ | [look-forward-to](/english/look-forward-to/) | [Cambridge English Grammar Today：Look forward to](https://dictionary.cambridge.org/grammar/british-grammar/look-forward-to)、[Cambridge Dictionary：look forward to something](https://dictionary.cambridge.org/dictionary/english/look-forward-to) |
