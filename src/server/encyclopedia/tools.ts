const empty = { type: "object", properties: {}, additionalProperties: false };
export const researchTools = [
  {
    type: "function",
    name: "entry_context",
    description: "读取当前词条字段、原件、既有证据及尚未处理字段。",
    inputSchema: empty,
  },
  {
    type: "function",
    name: "entry_source",
    description:
      "分页读取并校验当前词条已关联的来源快照，每次最多16000字符。offset 为字符偏移。",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "integer" },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["sourceId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_field",
    description:
      "提交单字段核查结果；程序校验、保存意图、事务采用和回读。重复提交已确认字段不会重复写入。",
    inputSchema: {
      type: "object",
      properties: {
        field: { type: "string" },
        outcome: {
          type: "string",
          enum: [
            "verified",
            "tentative",
            "not_found",
            "not_applicable",
            "conflict",
            "blocked",
          ],
        },
        value: {},
        reason: { type: "string" },
        nextCondition: { type: "string" },
        candidates: { type: "array", items: {} },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              uri: { type: "string" },
              title: { type: "string" },
              snapshot: { type: "string" },
              excerpt: { type: "string" },
              locator: { type: "string" },
              sourceId: { type: "integer" },
              documentPath: { type: "string" },
              sourceDate: { type: "string" },
            },
            required: ["uri", "title", "snapshot", "excerpt", "locator"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "field",
        "outcome",
        "value",
        "reason",
        "nextCondition",
        "evidence",
        "candidates",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "save_note",
    description: "将研究笔记保存到当前任务的独占目录。",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, text: { type: "string" } },
      required: ["name", "text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finish_task",
    description: "所有字段已处理后请求结束任务；程序独立核对完成条件。",
    inputSchema: empty,
  },
];
