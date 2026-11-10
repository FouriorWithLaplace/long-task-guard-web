# 全部分类词条数据库字段

导出时间：2026/11/10 18:01:17（北京时间）

共 15 个词条表，489 个数据库字段。

> 数据库字段名取自本次导出时的实际表结构；中文名称和说明取自当前字段字典。包含身份字段和未登记字典的列，不包含词条内容。

## 书籍

### 书籍（book）

数据库表：`wiki_type_book`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| subtitle | 副标题 | TEXT | fields.subtitle | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| original_title | 原作名 | TEXT | fields.original_title | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| aliases | 别名 | TEXT | fields.aliases | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| summary | 简要介绍 | TEXT | fields.summary | evidence_required | 本出版版本的站内内容概述，标明整理及依据，与出版社原始简介、原文摘录、翻译分开。 |
| original_language | 原创语言 | TEXT | fields.original_language | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| writing_date | 创作时间 | TEXT | fields.writing_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| first_publication_date | 首次出版时间 | TEXT | fields.first_publication_date | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| first_publication_region | 首次出版国家／地区 | TEXT | fields.first_publication_region | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| original_publisher | 原始出版社 | TEXT | fields.original_publisher | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| book_type | 书籍类型 | TEXT | fields.book_type | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| genre | 体裁 | TEXT | fields.genre | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| subjects | 学科分类 | TEXT | fields.subjects | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| themes | 主题 | TEXT | fields.themes | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| keywords | 关键词 | TEXT | fields.keywords | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audience | 适读人群 | TEXT | fields.audience | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| content_rating | 内容分级 | TEXT | fields.content_rating | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| background | 创作背景 | TEXT | fields.background | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| key_ideas | 核心观点 | TEXT | fields.key_ideas | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_questions | 研究问题 | TEXT | fields.research_questions | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| characters | 主要人物 | TEXT | fields.characters | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| places | 涉及地点 | TEXT | fields.places | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| events | 涉及事件 | TEXT | fields.events | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| terms | 相关术语 | TEXT | fields.terms | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| debates | 争议与批评 | TEXT | fields.debates | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| author_bio | 作者简介 | TEXT | fields.author_bio | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| authors | 作者 | TEXT | fields.authors | evidence_required | 本出版版本正式署名的作者，按原文次序记录，不混入其他版本的译者或编者。 |
| editors | 编者／主编 | TEXT | fields.editors | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| translators | 译者 | TEXT | fields.translators | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| illustrators | 插画师 | TEXT | fields.illustrators | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| photographers | 摄影师 | TEXT | fields.photographers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| preface_authors | 序言作者 | TEXT | fields.preface_authors | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| afterword_authors | 后记作者 | TEXT | fields.afterword_authors | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| annotators | 校注者 | TEXT | fields.annotators | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| corporate_authors | 机构作者 | TEXT | fields.corporate_authors | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publishing_editors | 责任编辑 | TEXT | fields.publishing_editors | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| researchers | 研究者与评论者 | TEXT | fields.researchers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| table_of_contents | 章节目录 | TEXT | fields.table_of_contents | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| excerpts | 摘录与页码 | TEXT | fields.excerpts | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| preface | 序言 | TEXT | fields.preface | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| afterword | 后记 | TEXT | fields.afterword | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publisher | 出版社 | TEXT | fields.publisher | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| producer | 出品方 | TEXT | fields.producer | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publication_place | 出版地 | TEXT | fields.publication_place | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publication_date | 出版日期 | TEXT | fields.publication_date | evidence_required | 本出版版本的出版日期，保留日期精度；与作品首次出版日期和重印日期区分。 |
| edition | 版次 | TEXT | fields.edition | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| impression | 印次 | TEXT | fields.impression | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| series | 丛书 | TEXT | fields.series | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| volume | 卷册 | TEXT | fields.volume | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| language | 本版语言 | TEXT | fields.language | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| binding | 装帧 | TEXT | fields.binding | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| page_count | 页数 | TEXT | fields.page_count | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| dimensions | 开本／尺寸 | TEXT | fields.dimensions | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| weight | 重量 | TEXT | fields.weight | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| print_run | 印数 | TEXT | fields.print_run | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| other_editions | 其他版本 | TEXT | fields.other_editions | evidence_required | 不同版本分别建词条，注明原版、译本、修订版等关系，通过真实entity_id或原始URL关联。译者、版次、出版社、语言、ISBN和出版日期属于本版本；内容不变的重印通常只记录印次，不另建词条。ISBN辅助识别，不能要求所有书籍都有ISBN或只凭ISBN自动合并。展示标题应能通过译者、版次或年份区分。 |
| isbn | ISBN | TEXT | fields.isbn | evidence_required | 本出版版本的ISBN，保留ISBN-10或ISBN-13及来源；不同版本不混填，无ISBN不虚构，不只凭ISBN自动合并词条。 |
| doi | DOI | TEXT | fields.doi | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| library_id | 国家图书馆号 | TEXT | fields.library_id | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| classification_number | 图书馆分类号 | TEXT | fields.classification_number | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publisher_id | 出版社编号 | TEXT | fields.publisher_id | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| external_ids | 外部数据库标识 | TEXT | fields.external_ids | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_books | 相关书籍 | TEXT | fields.related_books | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_papers | 相关论文 | TEXT | fields.related_papers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| book_reviews | 学术书评 | TEXT | fields.book_reviews | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| citations | 引用与被引用 | TEXT | fields.citations | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_projects | 相关项目与会议 | TEXT | fields.related_projects | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| series_works | 同系列作品 | TEXT | fields.series_works | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| previous_work | 前作 | TEXT | fields.previous_work | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| next_work | 续作 | TEXT | fields.next_work | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| adaptations | 影视／舞台／游戏改编 | TEXT | fields.adaptations | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| reading_lists | 推荐阅读与书单 | TEXT | fields.reading_lists | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| awards | 获奖记录 | TEXT | fields.awards | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| selected_lists | 入选榜单 | TEXT | fields.selected_lists | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| sales_records | 销量记录 | TEXT | fields.sales_records | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| reprints | 再版情况 | TEXT | fields.reprints | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| social_impact | 社会影响 | TEXT | fields.social_impact | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| academic_impact | 学术影响 | TEXT | fields.academic_impact | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| historical_significance | 历史地位 | TEXT | fields.historical_significance | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| ebook_formats | 电子书格式 | TEXT | fields.ebook_formats | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| file_size | 文件大小 | TEXT | fields.file_size | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| drm | 数字版权保护 | TEXT | fields.drm | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audio_duration | 有声书时长 | TEXT | fields.audio_duration | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| narrators | 朗读者 | TEXT | fields.narrators | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audio_platforms | 音频平台 | TEXT | fields.audio_platforms | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| accessibility | 无障碍与字幕 | TEXT | fields.accessibility | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| list_price | 定价 | TEXT | fields.list_price | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| currency | 币种 | TEXT | fields.currency | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| price_date | 价格记录时间 | TEXT | fields.price_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| sale_status | 销售状态 | TEXT | fields.sale_status | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| stock_status | 库存状态 | TEXT | fields.stock_status | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| purchase_links | 购买渠道 | TEXT | fields.purchase_links | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| library_holdings | 图书馆馆藏 | TEXT | fields.library_holdings | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| used_market | 二手市场 | TEXT | fields.used_market | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publication_cost | 出版成本 | TEXT | fields.publication_cost | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| printing_cost | 印刷成本 | TEXT | fields.printing_cost | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| award_money | 获奖奖金 | TEXT | fields.award_money | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| cost_basis | 成本口径／估算说明 | TEXT | fields.cost_basis | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| cover | 封面与书影 | TEXT | fields.cover | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| creator_photos | 作者照片 | TEXT | fields.creator_photos | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| contents_images | 目录图片 | TEXT | fields.contents_images | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| scans | 授权扫描件 | TEXT | fields.scans | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| sample_files | 试读文件 | TEXT | fields.sample_files | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audio | 音频 | TEXT | fields.audio | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| video | 视频 | TEXT | fields.video | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| maps | 地图 | TEXT | fields.maps | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| timeline | 时间线 | TEXT | fields.timeline | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| models_3d | 3D 展示 | TEXT | fields.models_3d | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| rights_holders | 权利人 | TEXT | fields.rights_holders | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| text_rights | 全文版权 | TEXT | fields.text_rights | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| image_rights | 图片版权 | TEXT | fields.image_rights | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| sample_rights | 试读授权 | TEXT | fields.sample_rights | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audio_rights | 音频授权 | TEXT | fields.audio_rights | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| license | 许可证 | TEXT | fields.license | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| copyright_term | 版权期限 | TEXT | fields.copyright_term | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| usage_restrictions | 使用限制 | TEXT | fields.usage_restrictions | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| user_reviews | 外部用户评论 | TEXT | fields.user_reviews | evidence_required | 外部用户评论：仅保存实际网站上的用户原评，不生成或冒充用户评价。每项保留平台、公开用户名、原评、日期（未知为null）、原始URL、平台评论ID或去重标识、对应作品版本及获取时间。只能验证评论发表于该网站，不保证身份或内容真实。评分保留原量表，各平台分开展示，不直接平均。翻译另存并标明翻译，不覆盖原评。迁移旧记录来源未明确时保留原值并待复核。 |
| translations | 简介与摘录译文 | TEXT | fields.translations | evidence_required | 原文、中文翻译和站内整理分别标明；翻译注明语言、对应原文位置、版本、来源及翻译方式，不覆盖原文，不冒充作者内容。 |
| abstract | 原始简介／摘要 | TEXT | sections.abstract | evidence_required | 本出版版本的原始简介，注明来自出版社或作者及原始来源；译文另存，不用站内整理冒充原文。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 论文

### 论文（paper）

数据库表：`wiki_type_paper`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| authors | 作者 | TEXT | fields.authors | evidence_required | 按原文保留作者姓名、署名顺序及署名角色，不猜测缩写或合作者身份。共同第一作者和共同通讯作者只按原文记录。 |
| author_note | 署名说明 | TEXT | fields.author_note | evidence_required | 保留共同第一作者、共同通讯作者、贡献与署名说明，注明对应作者和版本，不自行推断。 |
| journal | 期刊／出版物 | TEXT | fields.journal | evidence_required | 含义：该论文版本实际刊载的期刊、会议录或其他出版物正式名称。<br>不包含：预印本无期刊录用证据时不猜期刊，出版商不是刊名。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| doi | DOI | TEXT | fields.doi | evidence_required | 含义：原始记录明确绑定该论文及版本的DOI。<br>不包含：不填期刊、引用文献、数据集或其他版本DOI。<br>格式：单个DOI，去掉doi:或https://doi.org/前缀；保留标识内容，如10.1234/example。<br>单位与条件：不适用。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| language | 语言 | TEXT | fields.language | evidence_required | 含义：当前论文正文的主要语言；多语种需有原文依据。<br>不包含：不是作者国籍、摘要译文或网页界面语言。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| work_type | 文献类型 | TEXT | fields.work_type | evidence_required | 含义：原始出版记录给出的文献类型，如研究论文、综述、会议论文、勘误。<br>不包含：不把研究学科、数据库收录状态当文献类型。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| author_affiliations | 作者署名机构 | TEXT | fields.author_affiliations | evidence_required | 逐位作者对应论文发表时的署名机构，注明作者姓名或原文标号、机构和论文版本，不用名单顺序猜映射，不以人物当前任职机构替代。 |
| corresponding_authors | 通讯作者 | TEXT | fields.corresponding_authors | evidence_required | 按原文注明通讯作者与共同通讯作者及其署名机构、版本和来源，不从作者次序推断。 |
| publication_date | 发表日期 | TEXT | fields.publication_date | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| volume | 卷号 | TEXT | fields.volume | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| issue | 期号 | TEXT | fields.issue | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| pages | 页码或文章编号 | TEXT | fields.pages | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| arxiv_identifier | arXiv 标识 | TEXT | fields.arxiv_identifier | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| keywords | 关键词 | TEXT | fields.keywords | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_fields | 研究领域 | TEXT | fields.research_fields | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_question | 研究问题 | TEXT | fields.research_question | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| experimental_devices | 实验装置 | TEXT | fields.experimental_devices | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。 |
| software_used | 使用软件 | TEXT | fields.software_used | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。此处记录研究使用的软件。 |
| data_resources | 使用数据 | TEXT | fields.data_resources | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。此处记录研究使用的数据。 |
| received_date | 收稿日期 | TEXT | fields.received_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| accepted_date | 接收日期 | TEXT | fields.accepted_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publisher | 出版机构 | TEXT | fields.publisher | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| access_status | 获取方式 | TEXT | fields.access_status | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| license | 使用许可 | TEXT | fields.license | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publisher_url | 出版页面 | TEXT | fields.publisher_url | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| code_repository | 配套代码 | TEXT | fields.code_repository | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。注明配套代码的版本及用途。 |
| data_repository | 配套数据 | TEXT | fields.data_repository | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。注明配套数据版本及其为输入还是产出。 |
| supplementary_materials | 补充材料 | TEXT | fields.supplementary_materials | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| funding | 资助信息 | TEXT | fields.funding | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| corrections | 更正与撤稿信息 | TEXT | fields.corrections | evidence_required | 更正、撤稿和关注声明保留日期、来源与对应论文版本，不以新版本覆盖历史声明。 |
| related_papers | 相关论文 | TEXT | fields.related_papers | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。区分预印本、正式版、后续研究、更正和引用；不混同独立研究。 |
| related_books | 相关著作 | TEXT | fields.related_books | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| citation_count | 历史引用资料（口径待核） | TEXT | fields.citation_count | paused | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| metrics_source | 引用统计来源 | TEXT | fields.metrics_source | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| metrics_date | 引用统计日期 | TEXT | fields.metrics_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| peer_reviews | 审稿意见 | TEXT | fields.peer_reviews | evidence_required | 公开同行评审原文：记录论文版本、评审轮次、审稿人公开身份、原始意见、作者回复、日期、来源URL；意见与回复分开，不猜测匿名身份，不得用用户评论或AI评价代替。 |
| user_reviews | 外部用户评论 | TEXT | fields.user_reviews | evidence_required | 外部用户评论：仅保存实际网站上的用户原评，不生成或冒充用户评价。每项保留平台、公开用户名、原评、日期（未知为null）、原始URL、平台评论ID或去重标识、对应作品版本及获取时间。只能验证评论发表于该网站，不保证身份或内容真实。评分保留原量表，各平台分开展示，不直接平均。翻译另存并标明翻译，不覆盖原评。迁移旧记录来源未明确时保留原值并待复核。 |
| versions | 论文版本 | TEXT | fields.versions | evidence_required | 同一论文的修订版本记录在一个词条内，保留版本标识、日期、版本类型、DOI或arXiv标识及来源；明确预印本与正式版的对应关系。已经分别建词条的版本使用真实entity_id关联，不自动合并或删除旧词条。摘要、结论、审稿意见和更正须注明对应版本，不能混用。 |
| translations | 译文 | TEXT | fields.translations | evidence_required | 原文、中文翻译和站内整理分别标明；翻译注明语言、对应原文位置、版本、来源及翻译方式，不覆盖原文，不冒充作者内容。 |
| abstract | 原文摘要 | TEXT | sections.abstract | evidence_required | 含义：该论文当前版本完整原始摘要。<br>不包含：不使用PROGRAM SUMMARY、引言、结论、搜索摘要或AI生成摘要替代。<br>格式：与登记原始资料逐字一致的完整原文；保留段落与公式，不翻译、不删改、不拼接，不用章节生成摘要。<br>单位与条件：原文单位、符号及数值逐字保留。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 必须注明对应论文版本；中文翻译单独保存在translations，不覆盖原文。 |
| program_summary | 原始程序说明（PROGRAM SUMMARY） | TEXT | sections.program_summary | evidence_required | 含义：论文原件中明确标注PROGRAM SUMMARY的完整程序说明。<br>不包含：不充当原始摘要，不根据软件功能另写一段。<br>格式：与登记原始资料逐字一致的完整原文；保留段落与公式，不翻译、不删改、不拼接，不用章节生成摘要。<br>单位与条件：原文单位、符号及数值逐字保留。<br>适用性：仅有明确PROGRAM SUMMARY栏目时适用；一般论文为not_applicable。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| background | 研究背景 | TEXT | sections.background | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| objectives | 研究目标 | TEXT | sections.objectives | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| methodology | 方法与实验设计 | TEXT | sections.methodology | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| results | 主要结果 | TEXT | sections.results | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| discussion | 讨论与科学意义 | TEXT | sections.discussion | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| limitations_and_outlook | 局限与后续方向 | TEXT | sections.limitations_and_outlook | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| reproducibility | 数据、代码与可复现性 | TEXT | sections.reproducibility | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| summary | 内容概述 | TEXT | sections.summary | evidence_required | 基于对应版本论文正文整理简短概述，标明站内整理、版本和依据，不冒充作者摘要或结论。 |
| conclusion | 原文结论 | TEXT | sections.conclusion | evidence_required | 仅采集对应版本论文最后的Conclusion、Conclusions、Summary and Conclusions或结论章节原文，保留章节定位与来源；不得用原始摘要、翻译、AI总结或结果字段替代。确认没有结论章节记not_applicable，无法取得原文记not_found，不编造。 |
| internal_citation_count | 库内被引次数 | INTEGER | fields.internal_citation_count | system | 本数据库内去重后的引用该论文的其他论文数，不是外部引用量，也不按年累计。首批录入完成后再计算；未计算为null，不以0代替。 |
| is_highly_cited | 是否库内高被引 | TEXT | fields.is_highly_cited | system | 由库内被引次数判定；首批录入后另行确定阈值并计算。true显示高被引标签，false未达阈值，null尚未计算；不得抓取外部ESI标签填入。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 期刊

### 期刊（journal）

数据库表：`wiki_type_journal`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| publisher | 出版机构 | TEXT | fields.publisher | evidence_required | 含义：当前或资料时点的实际出版机构，必要时区别学会所有者和出版服务方。<br>不包含：不把单篇论文作者机构当出版方。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| website | 官方网站 | TEXT | fields.website | evidence_required | 含义：该期刊官方主页或出版方的本刊介绍页。<br>不包含：不是某篇论文页、数据库API或同名刊主页。<br>格式：同一主体的具体官方介绍或项目落地页，绝对http(s) URL；不填搜索结果页、API或无关首页。<br>单位与条件：不适用。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| full_title | 期刊全称 | TEXT | fields.full_title | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| abbreviation | 期刊缩写 | TEXT | fields.abbreviation | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| former_titles | 曾用刊名 | TEXT | fields.former_titles | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| founded_year | 创刊年份 | TEXT | fields.founded_year | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| country_region | 出版国家与地区 | TEXT | fields.country_region | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| language | 出版语言 | TEXT | fields.language | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| owner_society | 主办学会与机构 | TEXT | fields.owner_society | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| editor_in_chief | 主编 | TEXT | fields.editor_in_chief | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| editorial_board | 编委会 | TEXT | fields.editorial_board | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| editorial_office | 编辑部 | TEXT | fields.editorial_office | evidence_required | 编辑部名称、公开通讯地址和联系渠道及来源；复用编辑部字段，不重复新建地址字段。 |
| publication_frequency | 出版周期 | TEXT | fields.publication_frequency | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| article_types | 文章类型 | TEXT | fields.article_types | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| special_issues | 专题与专刊 | TEXT | fields.special_issues | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| publication_formats | 出版形式 | TEXT | fields.publication_formats | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| submission_url | 投稿入口 | TEXT | fields.submission_url | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| author_guidelines | 作者指南 | TEXT | fields.author_guidelines | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| peer_review_model | 同行评审方式 | TEXT | fields.peer_review_model | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| open_access_policy | 开放获取政策 | TEXT | fields.open_access_policy | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| license | 内容许可 | TEXT | fields.license | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| data_policy | 数据与代码政策 | TEXT | fields.data_policy | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| indexing_databases | 收录数据库 | TEXT | fields.indexing_databases | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| subject_categories | 学科分类 | TEXT | fields.subject_categories | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| archiving_services | 长期保存服务 | TEXT | fields.archiving_services | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_journals | 相关期刊 | TEXT | fields.related_journals | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| identifiers | ISSN 与期刊标识 | TEXT | fields.identifiers | evidence_required | 复用标识字段，区分印刷ISSN、电子ISSN、ISSN-L和国内CN刊号；标识必须对应本刊，不另外添加重复ISSN字段。 |
| metrics | 学术指标与年度统计 | TEXT | fields.metrics | evidence_required | 每项记录metric、value、year、source_url、provider、统计口径及适用学科。包含JIF、五年JIF、JCI、CiteScore、SJR、SNIP、h-index、自引率、年发文量、累计出版文献量、研究文章占比、Gold OA占比、JCR分区与排名、中科院分区及Top/综述期刊标识、知网复合与综合影响因子。分区注明版本及大小类，多学科分别保存；不同年份和指标不得混用，新锐分区与中科院分区分别标识。外部指标与库内引用量分开。 |
| author_charges | 作者费用与减免 | TEXT | fields.author_charges | evidence_required | 分别记录投稿、处理、版面、彩页等费用及APC，附币种、生效时间、适用条件、减免政策和来源。无收费需官方明确声明。 |
| overview | 期刊简介 | TEXT | fields.overview | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| repository_policy | 自存档与版本政策 | TEXT | fields.repository_policy | evidence_required | 区分预印本、接收稿、出版版的自存档许可、仓储与禁运期限。 |
| plagiarism_policy | 查重与学术诚信 | TEXT | fields.plagiarism_policy | evidence_required | 官方查重、伦理、纠错与撤稿政策及原始链接。 |
| publication_times | 评审与出版时长 | TEXT | fields.publication_times | evidence_required | 区分首次决定、外审、录用及上线时长；记录单位、统计时期、平均数或中位数、来源URL、official或user_reported性质及样本数。未知不推算，网友分享与官方统计分开。 |
| copyright_policy | 作者版权政策 | TEXT | fields.copyright_policy | evidence_required | 作者是否保留版权、使用许可与相关政策链接。 |
| persistent_identifiers | 文章永久标识 | TEXT | fields.persistent_identifiers | evidence_required | 本刊实际使用的DOI、Handle、ARK等。 |
| ai_policy | AI 使用政策 | TEXT | fields.ai_policy | evidence_required | 作者、审稿人、编辑使用AI工具的官方政策和日期。 |
| scope | 收录范围 | TEXT | sections.scope | evidence_required | 含义：本刊原始宗旨与范围明确列出的研究主题、稿件领域和边界。<br>不包含：不以期刊名推导范围，不复制overview凑字段。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：仅既有授权的本作品或本刊原始记录、原件及已登记来源；网络只能在另行授权的来源范围内定位核对，不因本契约扩大网页采用权限。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| history | 创刊与发展 | TEXT | sections.history | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| fusion_relevance | 聚变研究中的定位 | TEXT | sections.fusion_relevance | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| top_cited_papers | 库内被引前十论文 | TEXT | fields.top_cited_papers | system | 本刊库内论文按internal_citation_count降序、entity_id升序选前十，保存entity_id、次数、排名、计算时间与规则版本。首批录入后再计算；当前为null。 |
| submission_experiences | 投稿经验 | TEXT | fields.submission_experiences | evidence_required | 网站真实用户投稿经历：platform、公开用户名、日期、原文、来源URL、审稿轮次、投稿结果；不生成经验，不冒充官方统计，保留原始量表及样本条件。 |
| acceptance_statistics | 录用率统计 | TEXT | fields.acceptance_statistics | evidence_required | 录用比例、统计时期、样本数量、来源URL、来源性质（official或user_reported）；平台网友估计必须标明，未知样本不得编造。 |
| warning_history | 期刊预警记录 | TEXT | fields.warning_history | evidence_required | 按发布机构、版本年份、发布日期、状态、原因、来源URL记录；未找到不等于不在预警名单。不同机构的名单分开。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 装置

### 装置（device）

数据库表：`wiki_type_device`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| location | 所在地 | TEXT | fields.location | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| institution | 所属与运营机构 | TEXT | fields.institution | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| route | 技术路线 | TEXT | fields.route | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| website | 官方网站 | TEXT | fields.website | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| overview | 装置简介 | TEXT | fields.overview | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| assessment | 综合评定 | TEXT | fields.assessment | paused | 综合评定暂不采集、不生成评分；空值保持空值，已有历史资料保留，不作为已实现的打分系统。 |
| construction_background | 建设背景 | TEXT | fields.construction_background | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| principle | 装置原理 | TEXT | fields.principle | evidence_required | 描述装置物理与工程工作原理，和建设背景、研究目标分别保存，不从设计参数推断未提供的机制。 |
| objectives | 装置目标 | TEXT | fields.objectives | evidence_required | 有来源的研究与工程目标；区分目标和已实现成果。 |
| parameters | 技术参数 | TEXT | fields.parameters | evidence_required | 参数必须保留单位、工况、时间；不同条件的数值不得直接合并。 |
| systems | 关键系统 | TEXT | fields.systems | evidence_required | 关键系统介绍系统名字name和作用description，可保留稳定id。系统负责组成和作用说明；具体零部件、型号、供应商和更换历史记在components，并关联所属系统。 |
| timeline | 实验成果与运行时间轴 | TEXT | fields.timeline | evidence_required | 唯一时间轴：实验成果、实验战役、关键成就、状态变化及退役。每项保留稳定id、date（YYYY、YYYY-MM、YYYY-MM-DD或null）、title、kind、description、来源URL；可用end_date记录结束时间，日期字符串保留精度。state区分planned（计划）、occurred（已发生）、unknown（未确认）；status_after记录状态变化后的建设、调试、运行、维护、停运或退役。仅最近且有来源的已发生状态变更用于显示运行状态，成果发布不改变状态。实验日期与公布日期published_date分开，实际日期不明时记录成果公布，不以发布日期替代实验日期。保留工况、同次实验标识、相关论文/代码/数据集和节点ID，不能拼接不同实验的最高值。日期不明放最后，不推断先后和状态。 |
| components | 零部件 | TEXT | fields.components | evidence_required | 零部件总字段，内部JSON记录实际配置：稳定id、name、型号、用途、数量、参数、所属系统、供应商及供货范围、来源。可关联独立工程部件词条entity_id；通用部件知识与本装置实际配置分开。保留使用起止时间、替换历史和对应时间轴节点，未知不补造，历史配置不当作同时在用。供应商跟随具体零部件记录，避免独立重复维护。 |
| gallery | 图集 | TEXT | fields.gallery | evidence_required | 一个对象，含cover和images；cover就是装置顶部封面。图片可保存sha256或真实URL、说明与来源；无图时留空，不用其他装置图片代替。 |
| related_papers | 关联论文 | TEXT | fields.related_papers | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。 |
| code_repositories | 关联代码 | TEXT | fields.code_repositories | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。代码只作资源，不新建代码词条；区分使用的软件与实验产出的代码，注明版本。 |
| datasets | 关联数据集 | TEXT | fields.datasets | evidence_required | 关联应说明关系类型和原因，区分介绍、设计、使用、产出与引用；优先引用实际库内entity_id，否则保留外部名称与URL或DOI，不创建虚假ID。涉及版本、实验或时间轴节点时注明对应版本和节点ID。区分输入数据与实验产出的数据，保留数据集版本。 |
| model | 装置模型 | TEXT | fields.model | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| features | 装置特色 | TEXT | fields.features | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| participants | 机构与人员 | TEXT | fields.participants | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| safety | 安全与辐射 | TEXT | fields.safety | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| glossary | 术语表 | TEXT | fields.glossary | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| references | 参考来源 | TEXT | fields.references | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_devices | 关联装置 | TEXT | fields.related_devices | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| external_links | 其他外部资源 | TEXT | fields.external_links | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 机构

### 机构（org）

数据库表：`wiki_type_org`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| organization_type | 机构细分类型 | TEXT | fields.organization_type | evidence_required | 企业、高校、研究院；投资机构可填风投、私募股权、产业资本、基金会等；公共机构可填政府部门、协会、学会、国际组织。与机构大类分别保存。 |
| location | 所在地 | TEXT | fields.location | evidence_required | 含义：机构总部或明确指认分支的国家、行政区及城市，标明对应主体。<br>不包含：不把实验装置地址或作者通讯地址直接当总部。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| founded | 成立时间 | TEXT | fields.founded | evidence_required | 含义：该机构正式成立日期，按有据精度记录。<br>不包含：前身成立、注册、揭牌及改名日期不互相替代；差异留证。<br>格式：资料支持的YYYY、YYYY-MM或YYYY-MM-DD；不能用访问日期代替事件日期。<br>单位与条件：公历日期；保留实际精度。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| website | 官方网站 | TEXT | fields.website | evidence_required | 含义：该机构的官方主页或具体机构介绍页。<br>不包含：不采用同名企业、社交账号或上级机构无关页面。<br>格式：同一主体的具体官方介绍或项目落地页，绝对http(s) URL；不填搜索结果页、API或无关首页。<br>单位与条件：不适用。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| aliases | 简称与曾用名 | TEXT | fields.aliases | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| country_region | 国家与地区 | TEXT | fields.country_region | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| address | 公开办公地址 | TEXT | fields.address | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| parent_organization | 上级与隶属机构 | TEXT | fields.parent_organization | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| leadership | 机构负责人 | TEXT | fields.leadership | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| departments | 研究部门 | TEXT | fields.departments | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| laboratories | 重点实验室 | TEXT | fields.laboratories | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| staff_scale | 人员规模 | TEXT | fields.staff_scale | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| staff_scale_date | 人员统计日期 | TEXT | fields.staff_scale_date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_facilities | 研究设施 | TEXT | fields.research_facilities | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| funding_sources | 经费来源 | TEXT | fields.funding_sources | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| public_budget | 公开经费与财年 | TEXT | fields.public_budget | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_fields | 研究与关注领域 | TEXT | fields.research_fields | evidence_required | 研究与关注领域：企业与科研机构填技术和研究领域，投资机构填投资关注领域，公共机构填职能覆盖领域；复用同一字段。 |
| fusion_programs | 聚变研究计划 | TEXT | fields.fusion_programs | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| operated_devices | 运行装置 | TEXT | fields.operated_devices | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| major_projects | 代表项目 | TEXT | fields.major_projects | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| publications | 代表论文与报告 | TEXT | fields.publications | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| patents | 专利与知识产权 | TEXT | fields.patents | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| products_services | 产品与服务 | TEXT | fields.products_services | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| software_datasets | 软件与数据资源 | TEXT | fields.software_datasets | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| partners | 合作机构 | TEXT | fields.partners | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| consortia | 联盟与协作网络 | TEXT | fields.consortia | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| education_programs | 教育与人才培养 | TEXT | fields.education_programs | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| industry_partnerships | 产业合作 | TEXT | fields.industry_partnerships | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| public_reports | 机构发布的报告 | TEXT | fields.public_reports | evidence_required | 复用原公开年度报告字段，扩展至本机构发布的年报、行业报告、研究报告；每项含标题、日期、发布机构、报告类型、原始URL及可用的库内entity_id。关于本机构但由他人发布的报告不放此字段。 |
| newsroom | 官方新闻入口 | TEXT | fields.newsroom | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| overview | 机构简介 | TEXT | sections.overview | evidence_required | 含义：机构性质、职责、研究定位与主要活动的有据介绍。<br>不包含：不复制行业介绍或无依据规模排名。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| research | 聚变相关研究 | TEXT | sections.research | evidence_required | 含义：机构明确开展的聚变研究、平台、代表项目与成果。<br>不包含：区分机构角色、合作角色与计划成果。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| organization_structure | 组织架构 | TEXT | sections.organization_structure | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| key_programs | 重点项目与成果 | TEXT | sections.key_programs | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| technology_transfer | 技术转移与产业活动 | TEXT | sections.technology_transfer | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| collaboration | 国内外合作 | TEXT | sections.collaboration | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| timeline | 机构发展时间轴 | TEXT | fields.timeline | evidence_required | 有关本机构的全部已收录事件，以数组保存；每项含稳定id、date（YYYY、YYYY-MM、YYYY-MM-DD或null）、title、kind、description、source_url。kind为founding（成立）、research（研究）、product（产品）、funding（融资）、investment（投资）、partnership（合作）、team（团队）、policy（政策）、award（荣誉）、restructuring（重组）或other。计划标记state=planned，已发生为occurred，未核实为unknown；未知日期不猜测。可关联多个机构、人物、装置及报告的真实entity_id。 |
| organization_category | 机构大类 | TEXT | fields.organization_category | evidence_required | 仅允许enterprise_research（企业与科研机构）、investment（投资机构）、public（公共机构）。公共机构包括政府部门、协会、学会和国际组织；保留organization_type细分性质；未核实时为空，不从名称猜测。 |
| main_business | 主营业务 | TEXT | fields.main_business | evidence_required | 主营业务与服务对象，保留来源与适用时间；科研机构可填主要研究业务，不与具体products_services产品清单重复。 |
| team_members | 团队成员 | TEXT | fields.team_members | evidence_required | 公开团队成员及职务、任职起止时间、来源；可关联真实人物entity_id，未知不创建虚假ID；不含非公开个人资料。 |
| financing_opportunities | 融资与资助机会 | TEXT | fields.financing_opportunities | evidence_required | 投资机构与公共机构均适用。direction=offered表示对外投资、资助、补贴或招募项目；direction=sought表示自身募资。记录title、工具或方式、金额与币种、阶段、申请条件、截止时间、状态及来源URL，不把已完成投资当作开放机会。 |
| investment_timeline | 已投资项目时间轴 | TEXT | fields.investment_timeline | evidence_required | 仅投资机构适用；按每次投资事件记录稳定id、date、title、kind=investment、description、project（名称和真实entity_id）、round、amount、currency、role、source_url。重复投资分轮次，未知金额为空；同一事件在发展时间轴中复用id。 |
| assets_under_management | 管理资产与基金规模 | TEXT | fields.assets_under_management | evidence_required | 仅投资机构适用；区分管理资产AUM、单只基金规模、累计投资额，不相加；记录value、currency、scale_type、统计日期及来源。团队人数复用staff_scale。 |
| capital_nature | 资本性质 | TEXT | fields.capital_nature | evidence_required | 机构自身资本的国资、民资、混合、外资等性质与依据；可多选，保留日期，不与被投对象偏好混用。 |
| investment_preferences | 投资与融资偏好 | TEXT | fields.investment_preferences | evidence_required | 记录偏好的被投对象资本性质（国资、民资、混合、外资或不限）、投资阶段、地区、单笔金额区间、币种和融资方式；仅据公开信息填写，不从自身资本性质推断。关注领域复用research_fields。 |
| related_organizations | 推荐相关机构 | TEXT | fields.related_organizations | system | 程序按明确合作关系优先、共同研究或关注领域次之推荐库内机构；排除自身，返回真实entity_id与推荐原因，不由采集模型填充。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 人物

### 人物（person）

数据库表：`wiki_type_person`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| full_name | 姓名 | TEXT | fields.full_name | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：可靠原始资料明确归属于本人的完整姓名，保持姓名顺序和原有拼写。<br>不包含：不从首字母猜全名，不因同名绑定人物。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| romanized_name | 拉丁字母署名 | TEXT | fields.romanized_name | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：本人或权威资料实际使用的拉丁字母署名或罗马化姓名。<br>不包含：不由AI自行转写或按机构国家推断姓名。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| orcid | ORCID | TEXT | fields.orcid | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：经权威身份信息核对属于本人的ORCID。<br>不包含：不采用搜索同名命中而未经机构、作品等核对的号码。<br>格式：单个通过校验位验证的ORCID，格式0000-0000-0000-000X；必须有同一人物身份依据。<br>单位与条件：不适用。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| institutions | 文献署名机构 | TEXT | fields.institutions | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：原始文献中该人物署名所属机构，保留文献时点与原有层级。<br>不包含：不直接当作当前任职，不把合作者的机构分配给本人。<br>格式：有序非空字符串数组；作者按署名顺序，其余按来源顺序；不按逗号拆分人名或机构名。<br>单位与条件：每项保留必要时间、角色及条件，不能用数组序号猜映射。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| research_fields | 研究领域 | TEXT | fields.research_fields | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：可靠资料明确说明或已审核研究记录支持的研究方向。<br>不包含：不根据一篇合著论文标题自动扩展个人全部研究领域。<br>格式：有序非空字符串数组；作者按署名顺序，其余按来源顺序；不按逗号拆分人名或机构名。<br>单位与条件：每项保留必要时间、角色及条件，不能用数组序号猜映射。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| aliases | 其他姓名与署名 | TEXT | fields.aliases | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| nationality | 国籍 | TEXT | fields.nationality | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| birth_date | 出生日期 | TEXT | fields.birth_date | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| birth_place | 出生地 | TEXT | fields.birth_place | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| death_date | 逝世日期 | TEXT | fields.death_date | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| researcher_identifier | 其他学术标识 | TEXT | fields.researcher_identifier | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| personal_website | 个人主页 | TEXT | fields.personal_website | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| degree | 最高学位 | TEXT | fields.degree | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| education_history | 教育履历 | TEXT | fields.education_history | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| current_affiliation | 现任机构 | TEXT | fields.current_affiliation | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| academic_title | 职务与职称 | TEXT | fields.academic_title | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| positions | 任职履历 | TEXT | fields.positions | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| mentors | 导师 | TEXT | fields.mentors | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| students | 指导学生 | TEXT | fields.students | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| memberships | 学会与学术组织 | TEXT | fields.memberships | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_topics | 研究主题 | TEXT | fields.research_topics | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| representative_works | 代表论文与著作 | TEXT | fields.representative_works | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_projects | 参与研究计划 | TEXT | fields.research_projects | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_devices | 相关实验装置 | TEXT | fields.related_devices | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| patents | 专利与技术转化 | TEXT | fields.patents | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| software | 软件与代码 | TEXT | fields.software | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| datasets | 公开数据集 | TEXT | fields.datasets | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| collaborators | 合作研究者 | TEXT | fields.collaborators | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| awards | 奖项与荣誉 | TEXT | fields.awards | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| invited_lectures | 受邀报告 | TEXT | fields.invited_lectures | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| teaching_courses | 教学与课程 | TEXT | fields.teaching_courses | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| academic_service | 学术服务 | TEXT | fields.academic_service | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| paper_count | 论文数量 | TEXT | fields.paper_count | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| citation_count | 被引次数 | TEXT | fields.citation_count | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| h_index | H 指数 | TEXT | fields.h_index | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| metrics_source | 计量数据来源 | TEXT | fields.metrics_source | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| metrics_date | 计量数据统计日期 | TEXT | fields.metrics_date | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| overview | 人物简介 | TEXT | sections.overview | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：有身份依据的人物简介，区分已确认身份和文献署名事实。<br>不包含：不猜出生、职称、国籍，不以作者登记句充当简介。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| career | 研究经历 | TEXT | sections.career | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 含义：明确记载的任职机构、职务、工作内容及时间段。<br>不包含：不将署名机构自动升级为任职履历。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：人物新增内容仍暂停；本次仅定义字段。恢复前不得据此自动联网补履历、身份、署名或关系。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| contributions | 主要成果 | TEXT | sections.contributions | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| research_path | 研究方向与发展脉络 | TEXT | sections.research_path | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| scientific_impact | 学术影响 | TEXT | sections.scientific_impact | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| teaching_and_service | 教学与学术服务 | TEXT | sections.teaching_and_service | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| career_timeline | 生平与研究年表 | TEXT | sections.career_timeline | paused | 人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 课程

### 课程（lecture）

数据库表：`wiki_type_lecture`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| authors | 作者／主讲人 | TEXT | fields.authors | evidence_required | 含义：本资料正式署名作者、讲师或单场报告主讲人，角色按来源说明。<br>不包含：会议主办方、参会者和编委不自动当作者。<br>格式：有序非空字符串数组；作者按署名顺序，其余按来源顺序；不按逗号拆分人名或机构名。<br>单位与条件：每项保留必要时间、角色及条件，不能用数组序号猜映射。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| institution | 组织机构 | TEXT | fields.institution | evidence_required | 含义：资料的主办、承办、授课或发布机构，分别标角色。<br>不包含：作者机构不自动等于主办机构。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| location | 地点 | TEXT | fields.location | evidence_required | 含义：实际举办地点及线上或混合形式，必要时注明校区。<br>不包含：讲义没有对应活动地点时不从作者地址推断。<br>格式：单个非空文本，保持事实限定；多项用分号分隔，同项去重但不丢失时间与角色。<br>单位与条件：按原文保留单位、版本、时间和工况，不从上下文猜数值。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| resource_type | 资料类型 | TEXT | fields.resource_type | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| event_name | 所属会议或学校 | TEXT | fields.event_name | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| language | 语言 | TEXT | fields.language | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| date | 授课或报告日期 | TEXT | fields.date | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| website | 官方入口 | TEXT | fields.website | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| research_fields | 学科与研究领域 | TEXT | fields.research_fields | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| audience | 适用人群 | TEXT | fields.audience | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| level | 课程层次 | TEXT | fields.level | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| prerequisites | 前置知识 | TEXT | fields.prerequisites | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| learning_outcomes | 学习目标 | TEXT | fields.learning_outcomes | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| syllabus | 大纲与主题 | TEXT | fields.syllabus | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| duration | 课时与时长 | TEXT | fields.duration | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| assessment | 练习与考核方式 | TEXT | fields.assessment | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| lecture_notes | 讲义资源 | TEXT | fields.lecture_notes | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| slides | 幻灯片 | TEXT | fields.slides | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| exercises | 习题 | TEXT | fields.exercises | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| example_codes | 示例代码 | TEXT | fields.example_codes | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| example_datasets | 示例数据 | TEXT | fields.example_datasets | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| reading_list | 阅读书目 | TEXT | fields.reading_list | evidence_required | 合并同义字段，保留原始内容、来源和条件；不得重复填充已合并的旧字段。 |
| access_conditions | 获取条件 | TEXT | fields.access_conditions | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| license | 使用许可 | TEXT | fields.license | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| series | 所属课程系列 | TEXT | fields.series | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_courses | 相关课程 | TEXT | fields.related_courses | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_concepts | 相关概念 | TEXT | fields.related_concepts | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_devices | 相关装置 | TEXT | fields.related_devices | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_papers | 相关论文 | TEXT | fields.related_papers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_books | 相关书籍 | TEXT | fields.related_books | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| overview | 资料简介 | TEXT | sections.overview | evidence_required | 含义：按实际资料类型说明主题、对象、内容结构及对应活动。<br>不包含：不将整场会议介绍当成某一报告内容，不生成不存在的原文摘要。<br>格式：有证据的连贯中文正文，可用Markdown和LaTeX；保留事实条件；不写采集过程、占位内容或未经支持的评价。<br>单位与条件：涉及数值时保留单位、误差、工况和来源时点。<br>适用性：仅当资料明确涉及本词条对应事实时采集；无对应事实不得推断。<br>来源：优先主体官方资料、原始论文或原始技术文档；权威二手资料须可追溯且不冒充独立原始证据；搜索摘要、AI回答及无来源聚合页不可采用。<br>缺失：未找到、明确不适用、来源冲突分别输出 not_found、not_applicable、conflict，并附原因；value 为 null。不得写未知、暂无资料、N/A等占位内容，不得用0、false或空数组代表未知，不删除已有值。<br>冲突：比较同一主体、版本、时间和口径的原始证据；保留各候选值及证据，不投票、不平均、不按搜索排名选择，不自动覆盖旧值。不同时间或工况属于多个有条件事实，不冒充冲突。<br>证据：每个 found 值附支持该值的原文摘录、具体来源URL、source_kind、原文位置locator、资料日期source_date（不详则null）、实际访问日期accessed_at；不得编造网址、页码、日期或摘录。文本整理须逐项可追溯；URL字段的证据来自介绍该链接的页面。 |
| course_background | 课程与活动背景 | TEXT | sections.course_background | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| key_topics | 核心主题与知识要点 | TEXT | sections.key_topics | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| supporting_materials | 配套资料与资源 | TEXT | sections.supporting_materials | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| fusion_applications | 聚变研究中的应用 | TEXT | sections.fusion_applications | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 会议

### 会议（conference）

数据库表：`wiki_type_conference`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| overview | 会议简介 | TEXT | fields.overview | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| series | 会议系列 | TEXT | fields.series | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| date | 举办日期与时间 | TEXT | fields.date | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| location | 举办地点 | TEXT | fields.location | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| organizers | 主办与承办机构 | TEXT | fields.organizers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| speakers | 报告人与参与者 | TEXT | fields.speakers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| topics | 会议主题 | TEXT | fields.topics | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| website | 官方入口 | TEXT | fields.website | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| program | 议程与报告 | TEXT | fields.program | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| proceedings | 会议论文集 | TEXT | fields.proceedings | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| materials | 报告与讲义资料 | TEXT | fields.materials | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_papers | 关联论文 | TEXT | fields.related_papers | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| related_devices | 关联装置 | TEXT | fields.related_devices | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| additional_information | 其他会议信息 | TEXT | fields.additional_information | evidence_required | 按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

## 科学词条

### 工程部件（component）

数据库表：`wiki_type_component`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 科学概念（concept）

数据库表：`wiki_type_concept`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 诊断技术（diagnostic）

数据库表：`wiki_type_diagnostic`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 材料与燃料（material）

数据库表：`wiki_type_material`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 研究方法（method）

数据库表：`wiki_type_method`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 研究计划（program）

数据库表：`wiki_type_program`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |

### 物理量（quantity）

数据库表：`wiki_type_quantity`

| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |
| --- | --- | --- | --- | --- | --- |
| entity_id | 稳定实体ID | INTEGER | identity.entity_id | system | 保留现有身份信息，不改变词条ID与主体。 |
| name | 规范名称 | TEXT | identity.name | system | 保留现有身份信息，不改变词条ID与主体。 |
| name_en | 英文原名 | TEXT | identity.name_en | system | 保留现有身份信息，不改变词条ID与主体。 |
| content | 词条内容 | TEXT | fields.content | evidence_required | 自由JSON内容，没有预设键名、栏目或固定格式。依据本词条实际资料组织内容，允许任意对象、数组与嵌套结构；不能凭空编造事实，采用内容仍需证据。 |
| quality_score | 质量分数 | REAL | fields.quality_score | system | 0～100；程序计算：40%完备性＋40%证据覆盖可信度＋20%格式有效率。任一分项无法评估时留空；不代表学术价值。 |
| completeness_score | 完备性评分 | REAL | fields.completeness_score | system | 0～100；有效非空内容字段数／适用内容字段数×100。排除身份、程序计算、暂停采集字段；有核查记录的not_applicable排除分母。 |
| credibility_score | 可信度评分 | REAL | fields.credibility_score | system | 0～100；已填字段中具有可追溯原始来源和摘录的字段占比。仅衡量证据覆盖，不保证事实真实；排除history审计来源，无内容留空。 |
| fusion_relevance_score | 聚变相关度评分 | REAL | fields.fusion_relevance_score | system | 0～100；内容中的明确聚变主题命中为100，聚变支撑技术为60，一般等离子体为30，未命中为0，无内容留空。按版本化词表匹配，不以文件名、URL、证据日志或本评分字段作为输入。 |
