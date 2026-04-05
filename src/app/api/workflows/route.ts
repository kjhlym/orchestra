import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  try {
    const workflows = await prisma.workflow.findMany({
      where: projectId ? { projectId } : undefined,
    });
    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, harnessConfig } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const workflow = await prisma.workflow.create({
      data: {
        projectId,
        orchestratorStatus: 'idle',
        currentPhase: 'planning',
        harnessConfig: typeof harnessConfig === 'object' ? JSON.stringify(harnessConfig) : harnessConfig,
      }
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    console.error('Error creating workflow:', error);
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}
