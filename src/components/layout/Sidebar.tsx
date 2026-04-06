import Link from 'next/link';
import { LayoutDashboard, FolderPlus, ListTodo, Presentation, PlayCircle } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <h1 className="text-xl font-bold tracking-wider text-green-400">WF 오케스트라</h1>
      </div>
      <nav className="flex-1 py-6 px-3 space-y-2">
        <Link href="/" className="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
          <LayoutDashboard className="w-5 h-5 mr-3" />
          <span>대시보드</span>
        </Link>
        <Link href="/projects/new" className="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors">
          <FolderPlus className="w-5 h-5 mr-3" />
          <span>새 프로젝트</span>
        </Link>
        <div className="pt-6 pb-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          현재 프로젝트
        </div>
        <Link href="#" className="flex items-center px-3 py-2 text-gray-400 cursor-not-allowed">
          <ListTodo className="w-5 h-5 mr-3" />
          <span>백로그</span>
        </Link>
        <Link href="#" className="flex items-center px-3 py-2 text-gray-400 cursor-not-allowed">
          <Presentation className="w-5 h-5 mr-3" />
          <span>스프린트 보드</span>
        </Link>
        <Link href="#" className="flex items-center px-3 py-2 text-gray-400 cursor-not-allowed">
          <PlayCircle className="w-5 h-5 mr-3" />
          <span>에이전트 오케스트라</span>
        </Link>
      </nav>
      <div className="p-4 border-t border-gray-800 text-sm text-gray-500 text-center">
        v1.0.0
      </div>
    </aside>
  );
}
