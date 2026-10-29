# 学英语小测验：知识题来源

核对日期：2026-10-29。首批知识题共24道：真假词源与来源语言各12道。题干、干扰选项和解释为编写内容，整理与措辞有 AI 辅助；来源链接指向相应知识卡已经列明的材料。

## 数据与派生规则

- `quiz.json` 只维护知识题，不复制英语名句或作者题。每题必须指向已发布卡片，来源 URL 必须属于该卡。
- 真假词源的选项固定为真、假、存疑、部分正确；浏览器可以重新排列呈现。证据不足的说法保留“存疑”，不把词源争议强行判成唯一来源。
- 来源语言题定位一个明确词形或传播阶段。祖先形式、中转形式与现代英语形式不是同一个问题；例如 ketchup 题干保留“可能中介”的限定。
- 作者题只从 `home/brief/english-quotes.json` 派生，使用其中同一条原文、译文、出处和阅读提示。干扰项按作者卒年距离取其他三位作家，近似同一时代；不把后出的选集、节录或修订版年份当作作者所属时代。同一作者的卒年必须一致。
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

- `validate_quiz(data, cards)`：严格校验版本、题目字段、四个唯一选项、答案、已发布卡片、真实来源归属和公开文本/链接边界，返回独立复制的题目数组。
- `load_quiz(root, cards)`：只读仓库中显式的 `english-corner/quiz.json`，返回同样的已校验数组。
- `build_quiz_pools(english_quotes, knowledge)`：名句可传版本1包装对象或其中的 quotes 数组，knowledge 使用上一步的数组；输出 authors、etymology、origins 三池。小型构建测试不足四位作者时，作者池为空，不捏造作者。

`scripts/test_english_quiz.py` 核对 schema、非法私有链接、来源归属、作者去重和年代相近的干扰项、共用原文及其换行、生产数量。通用校验允许空知识题用于小型构建 fixture；生产 inventory 检查要求24题以上，两个知识模式各至少10题。
