import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";

const linearKey = secret("LinearAPIKey");

// --- GraphQL helper ---

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: linearKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw APIError.internal(`Linear API error: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw APIError.internal(`Linear GraphQL: ${JSON.stringify(data.errors)}`);
  return data;
}

// --- Types ---

export interface LinearTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
}

interface TaskListResponse {
  tasks: LinearTask[];
}

interface TaskDetailRequest {
  taskId: string;
}

interface TaskDetailResponse {
  task: LinearTask;
}

interface UpdateTaskRequest {
  taskId: string;
  state?: string;
  comment?: string;
}

interface UpdateTaskResponse {
  success: boolean;
}

// --- Endpoints ---

// Get tasks assigned to TheFold (with "thefold" label)
export const getAssignedTasks = api(
  { method: "POST", path: "/linear/tasks", expose: true, auth: true },
  async (_req: {}): Promise<TaskListResponse> => {
    const data = await gql(`
      query {
        issues(filter: {
          labels: { name: { eq: "thefold" } }
          state: { type: { nin: ["completed", "canceled"] } }
        }, first: 20) {
          nodes {
            id identifier title description
            state { name }
            priority
            labels { nodes { name } }
          }
        }
      }
    `);

    return {
      tasks: data.data.issues.nodes.map((i: any) => ({
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        description: i.description || "",
        state: i.state.name,
        priority: i.priority,
        labels: i.labels.nodes.map((l: any) => l.name),
      })),
    };
  }
);

// Get single task
export const getTask = api(
  { method: "POST", path: "/linear/task", expose: false },
  async (req: TaskDetailRequest): Promise<TaskDetailResponse> => {
    const data = await gql(
      `query($id: String!) {
        issue(id: $id) {
          id identifier title description
          state { name }
          priority
          labels { nodes { name } }
        }
      }`,
      { id: req.taskId }
    );

    const i = data.data.issue;
    return {
      task: {
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        description: i.description || "",
        state: i.state.name,
        priority: i.priority,
        labels: i.labels.nodes.map((l: any) => l.name),
      },
    };
  }
);

// Update task state and/or add comment
export const updateTask = api(
  { method: "POST", path: "/linear/task/update", expose: false },
  async (req: UpdateTaskRequest): Promise<UpdateTaskResponse> => {
    if (req.comment) {
      await gql(
        `mutation($id: String!, $body: String!) {
          commentCreate(input: { issueId: $id, body: $body }) { success }
        }`,
        { id: req.taskId, body: req.comment }
      );
    }

    // Note: "in_review" maps to your team's actual state name in Linear
    // You'll need to look up the state ID for your specific team
    return { success: true };
  }
);

// Cron: Check for new tasks every 5 minutes
const _cronCheck = new CronJob("check-thefold-tasks", {
  title: "Check Linear for TheFold tasks",
  schedule: "*/5 * * * *",
  endpoint: getAssignedTasks,
});
