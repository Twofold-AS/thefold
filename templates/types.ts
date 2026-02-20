export type TemplateCategory =
  | "auth"
  | "api"
  | "ui"
  | "database"
  | "payment"
  | "form"
  | "email"
  | "devops"
  | "notification"
  | "storage";

export interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  framework: string;
  files: TemplateFile[];
  dependencies: string[];
  variables: TemplateVariable[];
  useCount: number;
  createdAt: string;
}

// --- Request/Response types ---

export interface ListTemplatesRequest {
  category?: string;
}

export interface GetTemplateRequest {
  id: string;
}

export interface UseTemplateRequest {
  id: string;
  repo: string;
  variables?: Record<string, string>;
}

export interface UseTemplateResponse {
  files: TemplateFile[];
  dependencies: string[];
}

export interface CategoryCount {
  category: string;
  count: number;
}
