export interface ReadyExport {
  url: string;
  filename: string;
  count: number;
  originalsIncluded: boolean;
  expiresAt: number;
}

type ExportJobResponse =
  | { status: "preparing" }
  | ({ status: "ready" } & ReadyExport)
  | { status: "failed"; error: string };

function waitForPoll(signal: AbortSignal, interval: number): Promise<void> {
  return new Promise(function wait(resolve, reject) {
    signal.throwIfAborted();
    const timer = setTimeout(function finish() {
      signal.removeEventListener("abort", abort);
      resolve();
    }, interval);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForArchive(jobUrl: string, signal: AbortSignal, interval = 1500): Promise<ReadyExport> {
  let connectionFailures = 0;
  while (true) {
    signal.throwIfAborted();
    let response: Response | undefined;
    let job: ExportJobResponse | undefined;
    try {
      response = await fetch(jobUrl, { cache: "no-store", signal });
      if (response.ok) job = await response.json();
    } catch {
      signal.throwIfAborted();
      // 连接或响应体传输中断时继续查询同一个任务，不重新启动打包。
    }
    if (response && !response.ok && response.status < 500) {
      const body = await response.json();
      throw new Error(body.error || "无法查询导出任务，请重新导出。");
    }
    if (!job) {
      connectionFailures += 1;
      if (connectionFailures >= 5) throw new Error("连续多次无法连接后台，请检查服务后重新导出。");
    } else {
      connectionFailures = 0;
      if (job.status === "failed") throw new Error(job.error || "后台打包失败。");
      if (job.status === "ready") return job;
    }
    await waitForPoll(signal, interval);
  }
}
