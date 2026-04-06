import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  try {
    const backlogs = await prisma.productBacklog.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        tasks: true
      }
    });
    return NextResponse.json(backlogs);
  } catch (error) {
    console.error('백로그 목록 조회 오류:', error);
    return NextResponse.json({ error: '백로그 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, title, description, userStory, acceptanceCriteria, priority, storyPoints } = body;

    if (!projectId || !title) {
      return NextResponse.json({ error: '프로젝트 ID와 제목은 필수입니다.' }, { status: 400 });
    }

    const backlog = await prisma.productBacklog.create({
      data: {
        projectId,
        title,
        description,
        userStory,
        acceptanceCriteria,
        priority: priority || 'medium',
        storyPoints: storyPoints ? parseInt(storyPoints, 10) : null,
        status: 'todo'
      }
    });

    return NextResponse.json(backlog, { status: 201 });
  } catch (error) {
    console.error('백로그 생성 오류:', error);
    return NextResponse.json({ error: '백로그를 생성하지 못했습니다.' }, { status: 500 });
  }
}
