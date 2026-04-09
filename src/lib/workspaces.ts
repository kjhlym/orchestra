import path from "path";

export const DEFAULT_WORKSPACES_ROOT =
  path.basename(process.cwd()) === "src"
    ? path.resolve(process.cwd(), "..", "..", "orchestra_projects")
    : path.resolve(process.cwd(), "..", "orchestra_projects");

const configuredWorkspacesRoot = process.env.ORCHESTRA_PROJECTS_ROOT?.trim();

export const WORKSPACES_ROOT = resolveWorkspacesRoot(configuredWorkspacesRoot);

function resolveWorkspacesRoot(value: string | undefined) {
  if (!value) {
    return DEFAULT_WORKSPACES_ROOT;
  }

  if (process.platform !== "win32" && /^[A-Za-z]:[\\/]/.test(value)) {
    console.warn(
      `[workspaces] Ignoring Windows-style ORCHESTRA_PROJECTS_ROOT on ${process.platform}: ${value}`
    );
    return DEFAULT_WORKSPACES_ROOT;
  }

  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
