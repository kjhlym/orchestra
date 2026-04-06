import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        workflow: true,
        backlogs: {
          orderBy: { createdAt: "asc" },
          include: {
            tasks: true,
          },
        },
        sprints: {
          orderBy: { createdAt: "desc" },
          include: {
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("프로젝트 조회 오류:", error);
    return NextResponse.json(
      { error: "프로젝트 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      status?: string;
    };

    const data: {
      name?: string;
      description?: string | null;
      status?: string;
    } = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "프로젝트명은 비워둘 수 없습니다." },
          { status: 400 }
        );
      }
      data.name = trimmed;
    }

    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description?.trim() || null;
    }

    if (typeof body.status === "string" && body.status.trim()) {
      data.status = body.status.trim();
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        workflow: true,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("프로젝트 수정 오류:", error);
    return NextResponse.json(
      { error: "프로젝트를 수정하지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        workspacePath: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      workspacePath: project.workspacePath,
      message:
        "프로젝트 메타데이터를 삭제했습니다. 독립 워크스페이스 폴더는 자동으로 삭제하지 않았습니다.",
    });
  } catch (error) {
    console.error("프로젝트 삭제 오류:", error);
    return NextResponse.json(
      { error: "프로젝트를 삭제하지 못했습니다." },
      { status: 500 }
    );
  }
}
