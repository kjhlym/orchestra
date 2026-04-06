export type ProjectTechStack = {
  framework: string;
  css: string;
  database: string;
  deployment: string;
};

export type ProjectRequirements = {
  targetAudience: string;
  mustHaves: string;
  niceToHaves: string;
  constraints: string;
};

export type ProjectBootstrapInput = {
  name: string;
  description: string;
  techStack: ProjectTechStack;
  requirements: ProjectRequirements;
};

export type BacklogPriority = "critical" | "high" | "medium" | "low";

export type GeneratedBacklogItem = {
  title: string;
  description: string;
  userStory: string;
  acceptanceCriteria: string[];
  priority: BacklogPriority;
  storyPoints: number;
};

export type GeneratedBacklogRecord = {
  id: string;
  title: string;
  description: string | null;
  userStory: string | null;
  acceptanceCriteria: string | null;
  priority: string;
  storyPoints: number | null;
};

export type BootstrapEvent =
  | { type: "status"; message: string }
  | { type: "project-created"; projectId: string; projectName: string }
  | {
      type: "backlog-created";
      index: number;
      total: number;
      backlog: GeneratedBacklogRecord;
    }
  | { type: "complete"; projectId: string; backlogCount: number }
  | { type: "error"; message: string };

export function isProjectBootstrapInput(value: unknown): value is ProjectBootstrapInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.description === "string" &&
    isStringRecord(record.techStack) &&
    isStringRecord(record.requirements)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}
