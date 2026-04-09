import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

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
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedProjectId || !normalizedName) {
      return NextResponse.json({ error: '프로젝트 ID와 스프린트명은 필수입니다.' }, { status: 400 });
    }

    const parsedStartDate = parseOptionalDate(startDate);
    const parsedEndDate = parseOptionalDate(endDate);
    const parsedVelocity = parseOptionalInteger(velocity);

    if (startDate && !parsedStartDate) {
      return NextResponse.json({ error: '시작일 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (endDate && !parsedEndDate) {
      return NextResponse.json({ error: '종료일 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (velocity && parsedVelocity === null) {
      return NextResponse.json({ error: '예상 속도는 숫자여야 합니다.' }, { status: 400 });
    }

    const sprint = await prisma.sprint.create({
      data: {
        projectId: normalizedProjectId,
        name: normalizedName,
        goal,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        velocity: parsedVelocity,
      }
    });

    return NextResponse.json(sprint, { status: 201 });
  } catch (error) {
    console.error('스프린트 생성 오류:', error);
    return NextResponse.json({ error: '스프린트를 생성하지 못했습니다.' }, { status: 500 });
  }
}
