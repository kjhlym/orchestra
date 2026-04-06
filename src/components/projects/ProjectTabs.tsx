"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "backlog", label: "제품 백로그" },
  { href: "sprint", label: "스프린트 보드" },
  { href: "agents", label: "에이전트 모니터" },
  { href: "workflow", label: "오케스트라 워크플로우" },
] as const;

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const href = `/projects/${projectId}/${tab.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "border-b-2 px-5 py-4 text-sm font-medium transition-colors",
                active
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
