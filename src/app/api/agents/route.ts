import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

// 에이전트는 기획 단계에서 자동으로 스폰되는 구조 등을 상상할 수 있지만 우선은 기본 생성 제공
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and Type are required' }, { status: 400 });
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
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
