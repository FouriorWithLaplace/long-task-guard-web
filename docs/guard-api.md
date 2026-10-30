# 守护 API

服务默认地址为 `http://localhost:3000`，以实际启动端口为准。接口供页面、本机脚本和 AI 客户端共同使用；请求体为 JSON。本机客户端可不发送 `Origin`，浏览器修改请求必须同源，不开放跨站 CORS。

守护保存在服务内存中，服务重启后清空。读取列表、详情和订阅事件均不会启动任务。创建守护会立即进入启动流程，没有“仅保存”的接口。再次开始仍发送配置中的 `startMessage`，正常结束和中断后的续发规则与页面一致。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/sessions` | 获取本机已有会话，返回 `{ sessions: [...] }` |
| GET | `/api/models` | 只读取已有模型缓存 |
| POST | `/api/models` | 显式查询 Codex 并刷新模型缓存 |
| GET | `/api/guards` | 获取 `{ instanceId, revision, guards }` |
| POST | `/api/guards` | 创建并开始守护，返回 201 和守护快照 |
| GET | `/api/guards/:id` | 获取指定守护快照 |
| POST | `/api/guards/:id` | 开始、暂停或回复授权与输入请求 |
| DELETE | `/api/guards/:id` | 先暂停，再删除；成功返回 204 |
| POST | `/api/guards/bulk` | 批量开始、暂停、删除 |
| GET | `/api/guards/events` | SSE，`snapshot` 事件携带完整列表快照 |

每个守护快照包含 `id`、`createdAt`、`deleting`、`phase`、`settings`、`sessionTitle`、`projectPath`、`requests`、`logs` 等字段。错误响应为 `{ "error": "说明" }`；不存在返回 404，会话占用或状态冲突返回 409，参数错误返回 400。

## 创建并开始

先从会话和模型接口读取真实 ID，不填写虚构 ID。创建请求：

```json
{
  "settings": {
    "sessionId": "已有会话 ID",
    "model": "缓存中的模型 ID",
    "reasoning": "high",
    "startMessage": "请填写编号 001～008 的词条。",
    "retryMessage": "请继续执行当前任务。",
    "completeMessage": "请检查任务是否完成，并继续推进。"
  }
}
```

`retryMessage` 或 `completeMessage` 留空时，对应分支结束后自动暂停。连接失败等执行错误会保存在守护的运行记录中；创建的记录继续保留。同一会话被其他执行中的守护占用时拒绝创建，不增加记录。

Node.js 调用示例：

```javascript
const response = await fetch("http://localhost:3000/api/guards", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ settings: settings }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.id);
```

## 操作已有守护

向 `/api/guards/:id` 发送 POST：

```json
{ "action": "start" }
```

开始时默认使用保存的配置，也可提供完整 `settings` 修改已暂停守护的配置。

```json
{ "action": "pause" }
```

授权请求使用快照中 `requests` 对应的 ID：

```json
{ "action": "respond", "id": 123, "response": { "decision": "accept" } }
```

拒绝使用 `decision: "decline"`。回答输入请求时使用：

```json
{ "action": "respond", "id": 124, "response": { "answers": { "问题ID": "回答内容" } } }
```

## 批量操作

向 `/api/guards/bulk` 发送 POST，`action` 可为 `start`、`pause`、`delete`：

```json
{ "action": "pause", "ids": ["守护ID1", "守护ID2"] }
```

返回每项的结果，单项失败不阻断其他项：

```json
{
  "results": [
    { "id": "守护ID1", "success": true },
    { "id": "守护ID2", "success": false, "error": "守护不存在或已被删除。" }
  ]
}
```

重复 ID 只执行一次。批量开始跳过已经执行中的守护，直接并发启动其他守护；同一会话的并发占用仍返回单项冲突。批量删除逐个先暂停再移除管理记录，不删除 Codex 会话和工程成果。
