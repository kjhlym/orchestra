import type { WorkflowRole } from "@/lib/workflow-guidance";

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

export type ProjectVisualAssetSlot = {
  source: string;
  alt: string;
};

export type ProjectVisualAssetPlan = {
  hero?: ProjectVisualAssetSlot;
  gallery?: ProjectVisualAssetSlot[];
};

export type ProjectVisualAssets = {
  heroImage?: string;
  galleryImages?: string[];
};

export type ProjectDesignReference = {
  siteUrl?: string;
  notes?: string;
  mood?: string;
  summary?: string;
};

export type ProjectBootstrapInput = {
  name: string;
  description: string;
  techStack: ProjectTechStack;
  requirements: ProjectRequirements;
  designReference?: ProjectDesignReference;
  visualAssetPlan?: ProjectVisualAssetPlan;
  visualAssets?: ProjectVisualAssets;
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

export type GenerationSource = "gemini" | "fallback";

export type HomepageAuditRecord = {
  passed: boolean;
  score: number;
  checkedAt: string;
  framework: string;
  filePath: string;
  messages: string[];
  roleFindings?: Record<WorkflowRole, string[]>;
  skipped?: boolean;
};

export type DesignAuditRecord = {
  passed: boolean;
  score: number;
  checkedAt: string;
  framework: string;
  filePath: string;
  stylePath: string;
  messages: string[];
  roleFindings?: Record<WorkflowRole, string[]>;
  skipped?: boolean;
};

export type RoleQualityStatsRecord = Record<WorkflowRole, number>;

export type RoleRepairProfileRecord = {
  focusRoles: WorkflowRole[];
  focusMessages: Array<{
    role: WorkflowRole;
    message: string;
    count: number;
  }>;
  roleQualityStats: RoleQualityStatsRecord;
};

export type BootstrapEvent =
  | { type: "status"; message: string }
  | {
      type: "generation-source";
      stage: "draft" | "backlog";
      source: GenerationSource;
      message?: string;
    }
  | {
      type: "homepage-audit";
      audit: HomepageAuditRecord;
      message?: string;
    }
  | {
      type: "design-audit";
      audit: DesignAuditRecord;
      message?: string;
    }
  | {
      type: "role-quality";
      stats: RoleQualityStatsRecord;
      repairProfile?: RoleRepairProfileRecord | null;
      roleExecutionOrder?: WorkflowRole[];
      message?: string;
    }
  | {
      type: "design-reference-summary";
      summary: string;
      siteUrl?: string;
      title?: string;
      highlights?: string[];
      message?: string;
    }
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
    isStringRecord(record.requirements) &&
    (record.designReference === undefined || isDesignReferenceRecord(record.designReference)) &&
    (record.visualAssetPlan === undefined || isVisualAssetPlanRecord(record.visualAssetPlan)) &&
    (record.visualAssets === undefined || isVisualAssetsRecord(record.visualAssets))
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isVisualAssetsRecord(value: unknown): value is ProjectVisualAssets {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const heroImage = record.heroImage;
  const galleryImages = record.galleryImages;

  if (heroImage !== undefined && typeof heroImage !== "string") {
    return false;
  }

  if (galleryImages !== undefined) {
    if (!Array.isArray(galleryImages)) {
      return false;
    }

    if (!galleryImages.every((entry) => typeof entry === "string")) {
      return false;
    }
  }

  return true;
}

function isDesignReferenceRecord(value: unknown): value is ProjectDesignReference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const siteUrl = record.siteUrl;
  const notes = record.notes;
  const mood = record.mood;
  const summary = record.summary;

  if (siteUrl !== undefined && typeof siteUrl !== "string") {
    return false;
  }

  if (notes !== undefined && typeof notes !== "string") {
    return false;
  }

  if (mood !== undefined && typeof mood !== "string") {
    return false;
  }

  if (summary !== undefined && typeof summary !== "string") {
    return false;
  }

  return true;
}

function isVisualAssetPlanRecord(value: unknown): value is ProjectVisualAssetPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.hero !== undefined && !isVisualAssetSlotRecord(record.hero)) {
    return false;
  }

  if (record.gallery !== undefined) {
    if (!Array.isArray(record.gallery)) {
      return false;
    }

    if (!record.gallery.every((entry) => isVisualAssetSlotRecord(entry))) {
      return false;
    }
  }

  return true;
}

function isVisualAssetSlotRecord(value: unknown): value is ProjectVisualAssetSlot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.source === "string" && typeof record.alt === "string";
}
