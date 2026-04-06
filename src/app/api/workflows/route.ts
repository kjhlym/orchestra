import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  try {
    const workflows = await prisma.workflow.findMany({
      where: projectId ? { projectId } : undefined,
    });
    return NextResponse.json(workflows);
  } catch (error) {
    console.error('워크플로우 목록 조회 오류:', error);
    return NextResponse.json({ error: '워크플로우 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, harnessConfig } = body;

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID는 필수입니다.' }, { status: 400 });
    }

    const workflow = await prisma.workflow.create({
      data: {
        projectId,
        orchestratorStatus: 'idle',
        currentPhase: 'planning',
        harnessConfig: typeof harnessConfig === 'object' ? JSON.stringify(harnessConfig) : harnessConfig,
      }
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    console.error('워크플로우 생성 오류:', error);
    return NextResponse.json({ error: '워크플로우를 생성하지 못했습니다.' }, { status: 500 });
  }
}
