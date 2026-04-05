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
    console.error('Error fetching sprints:', error);
    return NextResponse.json({ error: 'Failed to fetch sprints' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, name, goal, startDate, endDate, velocity } = body;

    if (!projectId || !name) {
      return NextResponse.json({ error: 'Project ID and Name are required' }, { status: 400 });
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
    console.error('Error creating sprint:', error);
    return NextResponse.json({ error: 'Failed to create sprint' }, { status: 500 });
  }
}
