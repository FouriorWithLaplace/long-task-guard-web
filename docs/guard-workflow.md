# 守护业务说明

## 启动和使用

需要 Node.js 24、已安装并登录的本地 Codex，以及至少一个已有会话。

```powershell
npm install
npm run dev
```

打开终端显示的本地网址，然后：

1. 选择已有会话，确认自动显示的工程目录。
2. 首次点击“更新模型”读取真实模型和支持的推理强度，之后打开页面只读缓存。
3. 填写开始、异常重试和正常结束后发送的消息。
4. 点击“开始守护”，在原会话中执行，页面显示真实回复和工具记录。
5. 正常结束后立即发送正常结束消息，意外中断后立即发送重试消息。
6. 点击“暂停”中断本轮执行，并取消下一次发送。再次开始会发送“开始时发送”的内容。

对应的后续消息留空时，该分支结束后自动暂停，不会发送空消息。
主动暂停不会触发中断重试。Codex 仍在内部自行重试时，本轮仍在执行，不叠加发送新的消息。
执行期间配置会锁定；Codex 实际请求授权或用户输入时，页面会显示操作控件。
沿用本地 Codex 的配置，不额外覆盖沙箱或自动同意授权请求。

刷新或关闭网页不会取消服务器上的守护任务。运行状态和最近 500 条日志保存在本地服务内存中，重启服务后需要重新开始。
网页通过 SSE 保持一条连接，服务器在状态或日志变化时主动推送，不再每秒发送 GET 查询。断线后自动重新连接并接收最新状态，不会重复开始任务。连接保活和状态推送不会向 Codex 发送消息。

## 模型缓存

模型目录长期保存在 `%LOCALAPPDATA%\LongTaskGuardWeb\model-catalog.json`，不自动过期。
只有点击“更新模型”才查询本地 Codex，失败时保留旧缓存。选中的模型和推理强度保存在浏览器本地存储中。

可选环境变量：

- `LONG_TASK_GUARD_CODEX_PATH`：本地 Codex 可执行文件的绝对路径。未配置时寻找 PATH 和 VS Code 插件中的原生可执行文件。
- `LONG_TASK_GUARD_DATA_DIR`：模型缓存目录。
- `CODEX_HOME`：沿用 Codex 自身的数据目录配置。

## 代码入口

- `src/app/page.tsx`：会话选择、设置和操作按钮。
- `src/hooks/useGuard.ts`：页面接收实时状态、开始和暂停操作。
- `src/server/guard-runner.ts`：执行状态、事件触发续发、中断立即重试、暂停和日志。
- `src/server/guard-events.ts`：SSE 推送、断开清理和慢速读取时合并状态。
- `src/server/codex-client.ts`：本地 Codex app-server 的标准输入输出通信。
- `src/server/guard-service.ts`：查找会话和模型缓存、维护单个守护任务。
- `src/app/api/guard/route.ts`：浏览器访问守护业务的接口。
- `src/app/api/guard/events/route.ts`：浏览器接收状态和日志的长连接接口。

## 检查

```powershell
npm run lint
npx tsc --noEmit --incremental false
npm test
```

自动化测试模拟 Codex 通信，不运行真实模型推理，不修改真实会话。
