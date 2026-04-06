import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  try {
    const sprints = await prisma.sprint.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        tasks: true
      }
    });
    return NextResponse.json(sprints);
  } catch (error) {
    console.error('스프린트 목록 조회 오류:', error);
    return NextResponse.json({ error: '스프린트 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, name, goal, startDate, endDate, velocity } = body;

    if (!projectId || !name) {
      return NextResponse.json({ error: '프로젝트 ID와 스프린트명은 필수입니다.' }, { status: 400 });
    }

    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        name,
        goal,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        velocity: velocity ? parseInt(velocity, 10) : null,
      }
    });

    return NextResponse.json(sprint, { status: 201 });
  } catch (error) {
    console.error('스프린트 생성 오류:', error);
    return NextResponse.json({ error: '스프린트를 생성하지 못했습니다.' }, { status: 500 });
  }
}
