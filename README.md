# 长任务守护

**是否还在为 503 报错、连接中断而发愁？**

任务跑到一半因为各种意外突然断了，又得回来手动重试。

**是否已经把“继续”敲成了肌肉记忆？**

事情还没做完，Codex 却结束了这一轮，等你再催一句。

**是否同时开了好几个任务，切窗口切到眼花？**

哪个在干活、哪个在等你、哪个出了错，全靠自己盯。

**是否盯着满屏输出，却看不出任务到底推进到了哪一步？**

读了什么、改了什么、正在执行什么，想看进展还得翻半天。

**是否连关掉网页去喝杯水，都担心任务跟着停了？**

**让「长任务守护」替你盯着 Codex！**

- 🔄 **异常自动重试**：连接失败或执行中断后，自动尝试恢复原会话并续发。
- ▶️ **后续消息自动发**：正常结束和异常中断分别配置提示词，少一点手动催“继续”。
- 🗂️ **多个任务一起管**：卡片总览、并发运行，批量开始、暂停和删除。
- 📡 **执行进展实时看**：计划步骤、简短进展、工具活动持续更新，不必等到结束才知道干了什么。
- 🛠️ **减少权限反复打断**：默认使用完整操作权限，无需逐次授权；需要你回答的问题仍会展示。
- ☕ **离开网页，任务继续**：只要本地服务保持运行，刷新、切页或关闭网页都不会取消守护。
- ✋ **想停，随时停**：主动暂停会中断当前执行，并取消下一次续发。
- ✨ **直接开工，无需先建对话**：关联已有会话，或填写工程目录和提示词，开始时自动新建并绑定空白会话。

- ⚙️ **技术栈**：Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 构建界面与 API，Node.js 24 在本机运行，通过标准输入输出接入 Codex app-server，并用 SSE 将任务状态和日志实时推送到网页。

**长任务守护——少敲一句“继续”，少盯一晚屏幕。人可以休息，但是codex不可以。**

本机 Codex 会话守护应用。使用方式、自动续发规则和代码入口见 [守护业务说明](docs/guard-workflow.md)。

以下为 Next.js 工程的通用说明。

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
