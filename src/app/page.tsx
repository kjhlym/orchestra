import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, Activity, Blocks, CheckCircle2, ListTodo } from 'lucide-react';
import prisma from '@/lib/prisma';
import { formatKoreanDate, getProjectStatusLabel } from '@/lib/display';

type DashboardProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  updatedAt: Date;
  _count: {
    backlogs: number;
    sprints: number;
  };
};

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { sprints: true, backlogs: true }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
          <p className="text-muted-foreground mt-1">
            모든 웹사이트 팩토리 프로젝트 현황을 확인하세요.
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="bg-green-600 hover:bg-green-700">
            <PlusCircle className="mr-2 h-4 w-4" />
            새 프로젝트
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 프로젝트</CardTitle>
            <Blocks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 스프린트</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects.reduce((acc, p) => acc + p._count.sprints, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">시스템 상태</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">정상</div>
            <p className="text-xs text-muted-foreground mt-1">오케스트레이터 준비 완료</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">최근 프로젝트</h3>
        {projects.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <div className="rounded-full bg-green-100 p-3 mb-4">
              <Blocks className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium">아직 프로젝트가 없습니다</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mb-6">
              새 작업은 독립 워크스페이스 폴더에 생성해 메인 앱과 분리해 관리합니다.
            </p>
            <Link href="/projects/new">
              <Button>새 프로젝트 만들기</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: DashboardProject }) {
  const statusColors: Record<string, string> = {
    planning: 'bg-blue-100 text-blue-800',
    backlog: 'bg-yellow-100 text-yellow-800',
    sprint: 'bg-green-100 text-green-800',
    done: 'bg-gray-100 text-gray-800',
  };

  return (
    <Card className="flex flex-col hover:border-green-400 transition-colors cursor-pointer">
      <Link href={`/projects/${project.id}`} className="flex flex-col h-full">
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl line-clamp-1">{project.name}</CardTitle>
            <Badge variant="outline" className={statusColors[project.status] || 'bg-gray-100'}>
              {getProjectStatusLabel(project.status)}
            </Badge>
          </div>
          <CardDescription className="line-clamp-2 mt-2">
            {project.description || '설명이 없습니다'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="flex space-x-4 text-sm text-muted-foreground mt-4">
            <div className="flex items-center">
              <ListTodo className="mr-1 h-3 w-3" />
              백로그 {project._count.backlogs}개
            </div>
            <div className="flex items-center">
              <Activity className="mr-1 h-3 w-3" />
              스프린트 {project._count.sprints}개
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/50 py-3 px-6 text-sm">
          마지막 업데이트 {formatKoreanDate(project.updatedAt)}
        </CardFooter>
      </Link>
    </Card>
  );
}
