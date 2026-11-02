import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-slate-100 px-5 py-12 text-slate-900 [color-scheme:light] sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold tracking-widest text-blue-600">本机会话管理</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">长任务守护</h1>
          <p className="mt-4 text-sm leading-6 text-slate-500">查看正在执行的守护，或为一个会话新建守护。</p>
        </header>
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <Link href="/guards" className="group flex min-h-64 flex-col justify-between rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:min-h-80 sm:p-10">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            </span>
            <div className="mt-8">
              <h2 className="text-2xl font-bold">查看已有守护 <span aria-hidden="true" className="ml-2 inline-block text-blue-600 transition group-hover:translate-x-1">→</span></h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">总览所有会话的实时进展，批量开始、暂停和删除。</p>
            </div>
          </Link>
          <Link href="/guards/new" className="group flex min-h-64 flex-col justify-between rounded-3xl border border-blue-600 bg-blue-600 p-8 text-white shadow-sm transition hover:-translate-y-1 hover:bg-blue-700 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:min-h-80 sm:p-10">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            </span>
            <div className="mt-8">
              <h2 className="text-2xl font-bold">新建守护 <span aria-hidden="true" className="ml-2 inline-block transition group-hover:translate-x-1">→</span></h2>
              <p className="mt-3 text-sm leading-6 text-blue-100">关联已有会话或新建空白会话，填好消息即可开始。</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
