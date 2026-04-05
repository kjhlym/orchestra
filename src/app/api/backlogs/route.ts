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
    console.error('Error fetching backlogs:', error);
    return NextResponse.json({ error: 'Failed to fetch backlogs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, title, description, userStory, acceptanceCriteria, priority, storyPoints } = body;

    if (!projectId || !title) {
      return NextResponse.json({ error: 'Project ID and Title are required' }, { status: 400 });
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
    console.error('Error creating backlog:', error);
    return NextResponse.json({ error: 'Failed to create backlog' }, { status: 500 });
  }
}
