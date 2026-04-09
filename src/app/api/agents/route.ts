import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const ALLOWED_AGENT_TYPES = new Set(['planner', 'critic', 'designer', 'coder', 'tester']);
const AGENT_TYPE_CONFLICT_MESSAGE = '같은 유형의 에이전트는 하나만 만들 수 있습니다.';

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(agents);
  } catch (error) {
    console.error('에이전트 목록 조회 오류:', error);
    return NextResponse.json({ error: '에이전트 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type } = body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedType = typeof type === 'string' ? type.trim() : '';

    if (!normalizedName || !normalizedType) {
      return NextResponse.json({ error: '이름과 유형은 필수입니다.' }, { status: 400 });
    }

    if (!ALLOWED_AGENT_TYPES.has(normalizedType)) {
      return NextResponse.json({ error: '유형은 planner, critic, designer, coder, tester 중 하나여야 합니다.' }, { status: 400 });
    }

    const existingAgent = await prisma.agent.findUnique({
      where: { type: normalizedType },
    });

    if (existingAgent) {
      return NextResponse.json(
        { error: AGENT_TYPE_CONFLICT_MESSAGE },
        { status: 409 }
      );
    }

    const agent = await prisma.agent.create({
      data: {
        name: normalizedName,
        type: normalizedType,
        status: 'idle'
      }
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: AGENT_TYPE_CONFLICT_MESSAGE },
        { status: 409 }
      );
    }

    console.error('에이전트 생성 오류:', error);
    return NextResponse.json({ error: '에이전트를 생성하지 못했습니다.' }, { status: 500 });
  }
}
