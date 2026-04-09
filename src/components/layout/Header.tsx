import { Bell, Search, UserCircle } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-20 h-16 border-b border-white/70 bg-white/75 px-6 backdrop-blur-xl">
      <div className="flex items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="프로젝트 검색..."
            className="w-64 rounded-full border border-slate-200 bg-white/90 py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <button className="text-gray-500 transition hover:text-gray-800">
          <Bell className="w-5 h-5" />
        </button>
        <button className="flex items-center space-x-2 text-gray-500 transition hover:text-gray-800">
          <UserCircle className="w-6 h-6" />
          <span className="text-sm font-medium">관리자</span>
        </button>
      </div>
    </header>
  );
}
