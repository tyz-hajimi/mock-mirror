import type {
  InterviewHistoryEntry,
  InterviewLog,
  QuestionBlockEvaluation,
} from "./types";

/** 内置演示 ID：报告/问 AI / 历史中均使用该 id */
export const BUILTIN_DEMO_HISTORY_ID = "mm-builtin-demo-backend";

const JD_TEXT = `职位名称：资深后端开发工程师（Java/Go方向）
部门：技术研发部
地点：北京/上海/深圳（或远程）
薪资：25k-40k/月 + 14薪

岗位职责：
1. 负责核心业务系统（订单、支付、用户中心）的架构、开发与维护，保障高可用与高并发。
2. 参与需求评审，编写高质量代码与文档，完成单元与集成测试。
3. 性能优化、SQL 优化与重构，处理线上突发问题（内存泄漏、CPU 飙高等）。
4. 与前端、产品、运维协作推进项目上线。
5. 研究引入容器化、Service Mesh 等新技术。

任职要求：
- 本科及以上，3年+ 后端经验；精通 Java 或 Go；熟悉 JVM 或 Go 并发模型。
- Spring Boot/Cloud 或 Gin/Fiber；MySQL/PostgreSQL 复杂 SQL 与调优；Redis、RabbitMQ/Kafka；Linux 部署排障。
加分：高并发分布式、K8s/Prometheus、开源或博客。
软素质：逻辑清晰、沟通协作、Owner 意识、抗压。`;

const RESUME_TEXT = `张明 | 资深后端开发工程师（Java/Go）| 4年
电话：138-0000-1234 | ming.zhang@email.com
GitHub：github.com/mingzhang | 博客：ming.dev

教育：上海交通大学 计算机科学与技术 本科 2015-2019 GPA 3.8

技能：Java/Go/Spring Boot/Dubbo/Gin、Redis/Kafka/ES、MySQL/PG、Docker/K8s、阿里云

工作经历：
上海XX科技 后端开发 2021.04-至今
- 电商订单系统重构：微服务 Spring Cloud+Nacos，读写分离，Redis+Lua 库存预扣，RocketMQ 削峰，SkyWalking 链路；大促峰值 TPS 8000+，TP99 由 2.3s 降至约 180ms。

北京ABC技术 Java开发 2019.07-2021.02
- CRM：MyBatis-Plus、ES 替代 like 搜索（5s→200ms 级）、Shell 部署、Quartz 合同提醒。

项目：秒杀开源（Go+Gin+Redis+MQ）压测约 4500 QPS；分布式对象存储课设（Netty+Raft）。

奖项：技术创新奖、架构设计师（软考高项）、CET-6 580。`;

const OUTLINE: InterviewLog["outline"] = {
  categories: [
    {
      id: "basics",
      title: "技术基础",
      kind: "basics",
      questions: [
        "请结合你的 Java 经验说说 JVM 里一次 Full GC 常见触发原因，以及你在订单系统里是如何通过 JVM 参数或代码层面降低 GC 停顿风险的？",
        "Redis 除了缓存，你在项目里还用过哪些场景？如果缓存与数据库出现短暂不一致，你一般会怎么权衡和修复？",
        "消息队列在电商下单链路里常用来削峰填谷。说说你用 RocketMQ 或 Kafka 时，如何保证消息至少投递一次、以及如何避免重复消费带来的订单重复问题？",
      ],
    },
    {
      id: "live_coding",
      title: "手撕代码",
      kind: "live_coding",
      questions: [
        "请编写完整可运行的代码：给定一个仅包含 '(' 和 ')' 的字符串，判断是否合法括号匹配。要求处理空串、超长输入；请给出函数实现及简要思路注释，并说明时间空间复杂度。",
      ],
    },
    {
      id: "system_design",
      title: "系统设计",
      kind: "system_design",
      questions: [
        "假设你要设计一个类似朋友圈的 Feed 流时间线：用户可关注他人、按时间倒序刷动态。请口述整体架构（写扩散/读扩散取舍）、缓存与数据库表设计思路、以及热点用户时的降级策略，不需要写完整代码。",
      ],
    },
    {
      id: "project",
      title: "项目深挖",
      kind: "project",
      questions: [
        "你在简历里写订单系统重构时将 TP99 从 2.3 秒降到约 180 毫秒，请按「瓶颈如何发现 — 你改了什么 — 数据怎么验证」展开讲一讲，最好具体到接口或表。",
        "热点商品库存用 Redis+Lua 预扣减时，如果 Redis 与 MySQL 最终对齐延迟变大，你会如何监控和兜底，避免超卖或长时间不一致？",
        "北京那段 CRM 里用 Elasticsearch 替换模糊搜索，索引模型和同步策略你是怎么设计的？如果 ES 集群短暂不可用，业务上怎么降级？",
      ],
    },
    {
      id: "pressure",
      title: "情景与压力",
      kind: "pressure",
      questions: [
        "大促前夜有同事临时说核心下单接口可能要砍需求，上线风险很大，而产品经理坚持全量。作为后端 Owner，你会如何沟通和处理？如果最终必须上，你会 checklist 哪些验证点？",
      ],
    },
  ],
};

/** 按大纲顺序模拟的完整轮次：含少量追问，贴近真实语音/文本作答长度 */
const TURNS: InterviewLog["turns"] = [
  {
    role: "interviewer",
    text: OUTLINE.categories[0].questions[0],
  },
  {
    role: "candidate",
    text: "我这边遇到的 Full GC 常见有几类：一是老年代真正满了或晋升失败；二是元空间/Meta 区或配得不合理反复扩容；三是代码里大对象或内存泄漏导致老年代涨得快。订单系统那边我们先靠 GC 日志和 SkyWalking 看停顿分布，把并行收集器参数和堆大小调到相对稳的区间，同时业务上砍掉了一些不必要的大对象缓存，把热点对象生命周期缩短，这样 Full GC 次数明显下降。",
    elapsedMs: 185000,
  },
  {
    role: "interviewer",
    text: "你提到「大对象缓存」，能举一个具体是什么结构、为什么当初会放到堆里的例子吗？后面是怎么改成更轻量的方案的？",
  },
  {
    role: "candidate",
    text: "早期我们把整段促销规则 JSON 缓存在本地 Guava Cache 里，单条挺大，促销高峰时容易把年轻代挤爆。后来改成只缓存规则 ID 和少量标量，细节走 Redis，堆压力小很多，也更好横向扩容。",
    elapsedMs: 95000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[0].questions[1],
  },
  {
    role: "candidate",
    text: "Redis 我们除了缓存，还做了分布式锁（库存扣减临界区）、限流计数、短时去重（幂等 token）这些。缓存和 DB 不一致时，会先区分是短暂延迟还是逻辑 Bug：短暂的话用异步补偿或对账任务修；若是逻辑问题，宁可降级读主库或短暂关一部分非核心缓存，避免资金类字段长期错账。",
    elapsedMs: 210000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[0].questions[2],
  },
  {
    role: "candidate",
    text: "下单链路我们 RocketMQ 做异步落库和通知。至少一次投递靠 broker 重试+消费方_ack；重复消费靠业务幂等：订单号+状态机+数据库唯一约束三重保障，消息里带业务唯一键，重复消息会直接短路返回成功。",
    elapsedMs: 195000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[1].questions[0],
  },
  {
    role: "candidate",
    text: "【手撕代码】\n```java\npublic class Solution {\n  public boolean isValidParentheses(String s) {\n    if (s == null || s.length() == 0) return true;\n    Deque<Character> st = new ArrayDeque<>();\n    for (char c : s.toCharArray()) {\n      if (c == '(') st.push(c);\n      else {\n        if (st.isEmpty() || st.pop() != '(') return false;\n      }\n    }\n    return st.isEmpty();\n  }\n}\n```\n思路：栈遇到左括号入栈，右括号尝试匹配栈顶；最后栈须为空。时间 O(n)，空间 O(n)。",
    elapsedMs: 420000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[2].questions[0],
  },
  {
    role: "candidate",
    text: "Feed 我倾向读扩散为主、写扩散为辅：普通用户发动态写一条消息进队列， fan-out 到关注者的收件箱（或分片时间线）；超大 V 用单独拉模式或混合，避免写放大。存储上动态表按时间分区，关注关系存图或宽表；缓存热点时间线 TTL 短一点。热点用户降级：只推部分素材、延迟聚合或只展示关注人数量上限内的更新。",
    elapsedMs: 380000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[3].questions[0],
  },
  {
    role: "candidate",
    text: "瓶颈是监控里下单接口 TP99 和数据库连接等待飙高。发现是单体里订单+库存耦合、同步写放大。拆微服务后下单核心路径变短；读写分离把读压力和报表迁走；热点 SKU 用 Redis 预扣+MQ 异步写 MySQL。验证上对大促演练压测对比 TP 曲线，并核对账实一致率和对账任务零差错。",
    elapsedMs: 240000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[3].questions[1],
  },
  {
    role: "candidate",
    text: "监控会看 Redis 与 DB 的延迟分布、对账任务的积压长度；兜底上会放慢异步批次、必要时切短时同步双写窗口，并准备手工冻结超卖 SKU 的预案脚本，保证资损可控。",
    elapsedMs: 165000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[3].questions[2],
  },
  {
    role: "candidate",
    text: "索引按客户名称、ID等分词+keyword 混合；增量用 Canal 订阅 binlog 写 ES。ES 挂了会切回 MySQL like + 限制维度（慢但可用），并把同步队列堆在外部，恢复后做全量校验重建索引。",
    elapsedMs: 200000,
  },
  {
    role: "interviewer",
    text: OUTLINE.categories[4].questions[0],
  },
  {
    role: "candidate",
    text: "先拉双方对齐风险清单：容量、回滚方案、资损边界。产品上讨论能否分流量灰度。若必须全量，我会卡死压测基线、开关预案、值夜班排障表，并把非核心依赖降级开关前置到配置中心，确保可控上线。",
    elapsedMs: 150000,
  },
];

const EVAL_SAMPLES: QuestionBlockEvaluation[] = [
  {
    questionIndex: 0,
    category: "技术基础",
    kind: "basics",
    mainQuestion: OUTLINE.categories[0].questions[0],
    followupQuestion: "你提到「大对象缓存」，能举一个具体是什么结构、为什么当初会放到堆里的例子吗？后面是怎么改成更轻量的方案的？",
    result: {
      overallScore: 8.2,
      dimensionScores: {
        technicalAccuracy: 8,
        depth: 8,
        communication: 8,
        logic: 8,
        stressHandling: null,
      },
      strengths: [
        "能区分 Full GC 常见触发面并结合监控阐述",
        "追问中给出了可落地的缓存瘦身案例（Guava→Redis）",
      ],
      weaknesses: ["可对 GC 调优参数再点一两个具体例子（如最大停顿目标）"],
      redFlags: [],
      detailedFeedback:
        "主线回答覆盖触发原因与治理手段，与简历中订单系统场景一致；追问补充了堆内大对象的具体改造，表达可信。若补充 1～2 个 JVM flag 或 GC 日志判读会更像一线排障复盘。",
      followupComment: "对追问响应快，例子具体，加大分。",
      suggestedStudy: ["G1/ZGC 在延迟敏感场景下的选型对比"],
    },
    createdAt: "2026-01-15T10:18:00.000Z",
  },
  {
    questionIndex: 1,
    category: "技术基础",
    kind: "basics",
    mainQuestion: OUTLINE.categories[0].questions[1],
    followupQuestion: null,
    result: {
      overallScore: 7.8,
      dimensionScores: {
        technicalAccuracy: 8,
        depth: 7,
        communication: 8,
        logic: 8,
        stressHandling: null,
      },
      strengths: ["Redis 多场景与一致性权衡表述清楚"],
      weaknesses: ["可简要提到具体监控指标名或对账周期"],
      redFlags: [],
      detailedFeedback:
        "缓存用途列举合理，一致性问题分层（延迟 vs Bug）思路对。偏面试表达，可再量化你们对账 SLA。",
      followupComment: null,
      suggestedStudy: ["缓存与 DB 的延迟双写模式边界"],
    },
    createdAt: "2026-01-15T10:22:00.000Z",
  },
  {
    questionIndex: 3,
    category: "手撕代码",
    kind: "live_coding",
    mainQuestion: OUTLINE.categories[1].questions[0],
    followupQuestion: null,
    result: {
      overallScore: 8.5,
      dimensionScores: {
        technicalAccuracy: 9,
        depth: 8,
        communication: 8,
        logic: 9,
        stressHandling: null,
      },
      strengths: ["栈思路标准，边界空串与最终栈空判断完整"],
      weaknesses: ["若用 ArrayDeque 可注明非线程安全场景"],
      redFlags: [],
      detailedFeedback:
        "代码结构与复杂度分析到位，可作为手撕题通过线以上水准。若面试官追问括号多种字符变种需准备扩展。",
      followupComment: null,
      suggestedStudy: ["单调栈类变形题热身"],
    },
    createdAt: "2026-01-15T10:35:00.000Z",
  },
];

const DEMO_SCORE_REPORT: NonNullable<InterviewLog["scoreReport"]> = {
  total: 8.1,
  dimensions: {
    technical: 8,
    communication: 8,
    projectDepth: 8,
    composure: 7,
    coding: 8,
  },
  perQuestion: [{ index: 0, score: 8, note: "技术基础表述清晰" }],
  summary:
    "候选人与 JD 匹配度较高，能结合项目阐述高并发与中间件实践；表达结构尚可，可在边界场景与量化指标上再抠细节。手撕代码环节基本功扎实。",
  improvements: [
    "准备更多「如果当时没选 Redis 会怎样」的对比追问应答",
    "系统设计题可主动画出数据流与容量估算，展示工程化思维",
  ],
};

export const DEMO_INTERVIEW_LOG: InterviewLog = {
  resume: RESUME_TEXT,
  jd: JD_TEXT,
  company: "演示 · 资深后端（Java/Go）— 虚构公司与数据",
  mode: "realistic",
  outline: OUTLINE,
  turns: TURNS,
  questionEvaluations: EVAL_SAMPLES,
  scoreReport: DEMO_SCORE_REPORT,
};

export function getBuiltinDemoHistoryEntry(): InterviewHistoryEntry {
  return {
    id: BUILTIN_DEMO_HISTORY_ID,
    savedAt: "2026-01-15T10:40:00.000Z",
    log: DEMO_INTERVIEW_LOG,
  };
}
