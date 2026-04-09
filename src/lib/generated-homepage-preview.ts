import { promises as fs } from "fs";
import path from "path";

type PreviewCard = {
  title: string;
  description: string;
  priority?: string;
};

type PreviewTheme = {
  key: string;
  pageShell: string;
  headerShell: string;
  heroSectionShell: string;
  heroShell: string;
  heroMediaShell: string;
  sectionShell: string;
  cardShell: string;
  featuredCardShell: string;
  processShell: string;
  faqShell: string;
  footerShell: string;
  trustChipShell: string;
  chipShell: string;
  footerChipShell: string;
  logoShell: string;
  primaryButtonShell: string;
  secondaryButtonShell: string;
  accentLabel: string;
  mutedLabel: string;
  palette: string[];
};

type PreviewBlueprint = {
  category: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  metrics: Array<{ label: string; value: string }>;
  valueProps: Array<{ title: string; description: string }>;
  collectionFilters: Array<{ label: string; note: string }>;
  showcaseItems: Array<{
    tag: string;
    title: string;
    description: string;
    note: string;
    details: string;
    image?: string;
  }>;
  visualAssets?: {
    heroImage: string;
    showcaseImages: string[];
  };
  buildPlanCards: PreviewCard[];
  backlogCards?: PreviewCard[];
  processSteps: Array<{
    step: string;
    title: string;
    description: string;
  }>;
  trustPoints: string[];
  editorialSpotlight: {
    eyebrow: string;
    title: string;
    description: string;
    bullets: string[];
  };
  socialProof: {
    eyebrow: string;
    title: string;
    summary: string;
    score: string;
    quotes: Array<{
      name: string;
      role: string;
      quote: string;
    }>;
  };
  serviceCards: Array<{
    title: string;
    description: string;
  }>;
  faq: Array<{
    question: string;
    answer: string;
  }>;
};

export type GeneratedHomepagePreview = {
  blueprint: PreviewBlueprint;
  theme: PreviewTheme;
  sourcePath: string;
};

export async function loadGeneratedHomepagePreview(
  workspacePath: string | null | undefined
): Promise<GeneratedHomepagePreview | null> {
  if (!workspacePath) {
    return null;
  }

  const sourcePath = path.join(workspacePath, "src", "app", "page.tsx");
  const source = await fs.readFile(sourcePath, "utf8").catch(() => null);

  if (!source) {
    return null;
  }

  const blueprintText = extractAssignment(source, "const blueprint = ", "\nconst theme = ");
  const themeText = extractAssignment(source, "const theme = ", "\n\nexport default function Home()");

  if (!blueprintText || !themeText) {
    return null;
  }

  try {
    return {
      blueprint: JSON.parse(blueprintText) as PreviewBlueprint,
      theme: JSON.parse(themeText) as PreviewTheme,
      sourcePath,
    };
  } catch {
    return null;
  }
}

function extractAssignment(source: string, prefix: string, suffix: string) {
  const start = source.indexOf(prefix);
  if (start === -1) {
    return null;
  }

  const valueStart = start + prefix.length;
  const end = source.indexOf(suffix, valueStart);
  if (end === -1) {
    return null;
  }

  return source.slice(valueStart, end).trim().replace(/;$/, "");
}
