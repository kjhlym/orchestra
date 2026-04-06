import { Bell, Search, UserCircle } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="프로젝트 검색..."
            className="pl-9 pr-4 py-2 bg-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-64"
          />
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <button className="text-gray-500 hover:text-gray-700">
          <Bell className="w-5 h-5" />
        </button>
        <button className="text-gray-500 hover:text-gray-700 flex items-center space-x-2">
          <UserCircle className="w-6 h-6" />
          <span className="text-sm font-medium">관리자</span>
        </button>
      </div>
    </header>
  );
}
