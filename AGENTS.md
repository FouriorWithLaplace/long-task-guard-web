## 代码可读性与教学约定

- 在保证正确性的前提下，能简化的代码就简化，优先选择方便他人阅读和维护的写法。
- 简化以降低理解成本为目标，不追求最少行数；复杂表达式应拆成清楚的步骤，并使用含义明确的变量名。
- 代码与讲解优先使用普通函数、显式中间变量和展开形式，避免不必要的嵌套回调、箭头函数及多种简写叠加。
- 引入必要的新语法时，说明它的输入、输出和作用；可以用 C++ 类比，但要指出关键差异。
- 不为简化牺牲状态更新、并发处理和资源清理的正确性。需要函数式更新或其他机制时，保留必要机制，并用清楚的展开写法解释。
- 用户自行手写项目代码。除非用户明确要求修改文件，否则提供代码和操作说明，不代为实现；本规则文件的更新按用户明确要求执行。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
