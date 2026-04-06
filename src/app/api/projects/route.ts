import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        workflow: true,
        _count: {
          select: {
            backlogs: true,
            sprints: true,
          },
        },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("프로젝트 목록 조회 오류:", error);
    return NextResponse.json(
      { error: "프로젝트 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      techStack?: Record<string, string>;
      requirements?: Record<string, string>;
    };

    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { error: "프로젝트명은 필수입니다." },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description: body.description?.trim() || null,
        techStack: body.techStack ? JSON.stringify(body.techStack) : null,
        requirements: body.requirements ? JSON.stringify(body.requirements) : null,
        status: "planning",
        workflow: {
          create: {
            orchestratorStatus: "idle",
            currentPhase: "planning",
          },
        },
      },
      include: {
        workflow: true,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("프로젝트 생성 오류:", error);
    return NextResponse.json(
      { error: "프로젝트를 생성하지 못했습니다." },
      { status: 500 }
    );
  }
}
