import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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

    if (!name || !type) {
      return NextResponse.json({ error: '이름과 유형은 필수입니다.' }, { status: 400 });
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        type,
        status: 'idle'
      }
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error('에이전트 생성 오류:', error);
    return NextResponse.json({ error: '에이전트를 생성하지 못했습니다.' }, { status: 500 });
  }
}
