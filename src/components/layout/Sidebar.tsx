import Link from 'next/link';
import { LayoutDashboard, FolderPlus, ListTodo, Presentation, PlayCircle } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-white/10 bg-slate-950 text-white shadow-[20px_0_80px_rgba(15,23,42,0.25)]">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Orchestra</div>
          <h1 className="text-lg font-semibold tracking-tight text-white">웹사이트 팩토리</h1>
        </div>
      </div>
      <nav className="flex-1 space-y-2 px-3 py-6">
        <Link href="/" className="flex items-center rounded-xl px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/8 hover:text-white">
          <LayoutDashboard className="w-5 h-5 mr-3" />
          <span>대시보드</span>
        </Link>
        <Link href="/projects/new" className="flex items-center rounded-xl px-3 py-2.5 text-sm text-slate-200 transition hover:bg-emerald-400/10 hover:text-white">
          <FolderPlus className="w-5 h-5 mr-3" />
          <span>새 프로젝트</span>
        </Link>
        <div className="px-3 pt-6 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          현재 프로젝트
        </div>
        <Link href="#" className="flex cursor-not-allowed items-center px-3 py-2.5 text-sm text-slate-500">
          <ListTodo className="w-5 h-5 mr-3" />
          <span>백로그</span>
        </Link>
        <Link href="#" className="flex cursor-not-allowed items-center px-3 py-2.5 text-sm text-slate-500">
          <Presentation className="w-5 h-5 mr-3" />
          <span>스프린트 보드</span>
        </Link>
        <Link href="#" className="flex cursor-not-allowed items-center px-3 py-2.5 text-sm text-slate-500">
          <PlayCircle className="w-5 h-5 mr-3" />
          <span>에이전트 오케스트라</span>
        </Link>
      </nav>
      <div className="border-t border-white/10 p-4 text-center text-sm text-slate-500">
        v1.0.0
      </div>
    </aside>
  );
}
