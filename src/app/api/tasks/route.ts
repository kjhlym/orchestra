import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get('sprintId');
  const backlogId = searchParams.get('backlogId');

  try {
    const where: { sprintId?: string; backlogId?: string } = {};
    if (sprintId) where.sprintId = sprintId;
    if (backlogId) where.backlogId = backlogId;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('작업 목록 조회 오류:', error);
    return NextResponse.json({ error: '작업 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, assignedAgent, sprintId, backlogId } = body;
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';

    if (!normalizedTitle) {
      return NextResponse.json({ error: '작업 제목은 필수입니다.' }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title: normalizedTitle,
        description,
        assignedAgent,
        sprintId,
        backlogId,
        status: 'todo'
      }
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('작업 생성 오류:', error);
    return NextResponse.json({ error: '작업을 생성하지 못했습니다.' }, { status: 500 });
  }
}
