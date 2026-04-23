export type ProjectType = "code" | "framer" | "figma" | "framer_figma";
export type ProjectSourceOfTruth = "repo" | "framer" | "figma";
export type ProjectScope = "cowork" | "designer";

export interface Project {
  id: string;
  name: string;
  projectType: ProjectType;
  description: string | null;
  ownerEmail: string;
  githubRepo: string | null;
  githubPrivate: boolean;
  githubAutoMerge: boolean;
  githubAutoPr: boolean;
  framerSiteUrl: string | null;
  figmaFileUrl: string | null;
  sourceOfTruth: ProjectSourceOfTruth;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Derive which UI tab a project belongs to */
export function projectScope(type: ProjectType): ProjectScope {
  return type === "code" ? "cowork" : "designer";
}

/** GitHub repo-name regex — only letters, digits, dot, underscore, hyphen */
export const GITHUB_REPO_REGEX = /^[a-zA-Z0-9._-]+$/;
