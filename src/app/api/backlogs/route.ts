import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const ALLOWED_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

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
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';

    if (!normalizedProjectId || !normalizedTitle) {
      return NextResponse.json({ error: '프로젝트 ID와 제목은 필수입니다.' }, { status: 400 });
    }

    const normalizedPriority =
      typeof priority === 'string' && ALLOWED_PRIORITIES.has(priority.trim())
        ? priority.trim()
        : 'medium';

    const normalizedStoryPoints =
      storyPoints === null || storyPoints === undefined || storyPoints === ''
        ? null
        : Number.parseInt(String(storyPoints), 10);

    if (normalizedStoryPoints !== null && Number.isNaN(normalizedStoryPoints)) {
      return NextResponse.json({ error: '스토리 포인트는 숫자여야 합니다.' }, { status: 400 });
    }

    const backlog = await prisma.productBacklog.create({
      data: {
        projectId: normalizedProjectId,
        title: normalizedTitle,
        description,
        userStory,
        acceptanceCriteria,
        priority: normalizedPriority,
        storyPoints: normalizedStoryPoints,
        status: 'todo'
      }
    });

    return NextResponse.json(backlog, { status: 201 });
  } catch (error) {
    console.error('백로그 생성 오류:', error);
    return NextResponse.json({ error: '백로그를 생성하지 못했습니다.' }, { status: 500 });
  }
}
