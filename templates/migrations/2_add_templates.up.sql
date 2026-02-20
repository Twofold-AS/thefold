-- Cron Job Service
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Cron Job Service',
  'Encore.ts CronJob with database logging and error handling. Scheduled task with customizable interval.',
  'api',
  'encore.ts',
  '[
    {
      "path": "{{SERVICE_NAME}}/{{SERVICE_NAME}}.ts",
      "content": "import { api } from \"encore.dev/api\";\nimport { CronJob } from \"encore.dev/cron\";\nimport { db } from \"./db\";\nimport log from \"encore.dev/log\";\n\nexport const {{TASK_NAME}} = api(\n  { expose: false },\n  async (): Promise<{ processed: number }> => {\n    log.info(\"{{TASK_NAME}} started\");\n    let processed = 0;\n\n    try {\n      // Your task logic here\n      const rows = await db.query`SELECT id FROM items WHERE processed = false LIMIT 100`;\n      for await (const row of rows) {\n        await db.exec`UPDATE items SET processed = true WHERE id = ${row.id}`;\n        processed++;\n      }\n\n      // Log execution\n      await db.exec`\n        INSERT INTO cron_logs (task_name, processed_count, status)\n        VALUES (''{{TASK_NAME}}'', ${processed}, ''success'')\n      `;\n\n      log.info(\"{{TASK_NAME}} completed\", { processed });\n      return { processed };\n    } catch (err) {\n      const error = err instanceof Error ? err.message : String(err);\n      log.error(\"{{TASK_NAME}} failed\", { error });\n\n      await db.exec`\n        INSERT INTO cron_logs (task_name, processed_count, status, error)\n        VALUES (''{{TASK_NAME}}'', ${processed}, ''failed'', ${error})\n      `;\n\n      throw err;\n    }\n  }\n);\n\nconst _ = new CronJob(\"{{TASK_NAME}}\", {\n  title: \"{{TASK_DESCRIPTION}}\",\n  schedule: \"{{CRON_SCHEDULE}}\",\n  endpoint: {{TASK_NAME}},\n});",
      "language": "typescript"
    },
    {
      "path": "{{SERVICE_NAME}}/db.ts",
      "content": "import { SQLDatabase } from \"encore.dev/storage/sqldb\";\n\nexport const db = new SQLDatabase(\"{{SERVICE_NAME}}\", {\n  migrations: \"./migrations\",\n});",
      "language": "typescript"
    },
    {
      "path": "{{SERVICE_NAME}}/migrations/1_create_tables.up.sql",
      "content": "CREATE TABLE cron_logs (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  task_name TEXT NOT NULL,\n  processed_count INT DEFAULT 0,\n  status TEXT NOT NULL,\n  error TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_cron_logs_task ON cron_logs(task_name, created_at DESC);",
      "language": "sql"
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "SERVICE_NAME", "description": "Name of the Encore.ts service", "defaultValue": "tasks"},
    {"name": "TASK_NAME", "description": "Function name for the cron task", "defaultValue": "processItems"},
    {"name": "TASK_DESCRIPTION", "description": "Human-readable task description", "defaultValue": "Process pending items"},
    {"name": "CRON_SCHEDULE", "description": "Cron schedule expression", "defaultValue": "0 * * * *"}
  ]'::jsonb
);

-- Pub/Sub Event System
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Pub/Sub Event System',
  'Encore.ts Topic and Subscription with typed events. Decoupled event-driven communication between services.',
  'api',
  'encore.ts',
  '[
    {
      "path": "{{SERVICE_NAME}}/events.ts",
      "content": "import { Topic } from \"encore.dev/pubsub\";\n\nexport interface {{EVENT_TYPE}} {\n  id: string;\n  userId: string;\n  timestamp: Date;\n  data: Record<string, unknown>;\n}\n\nexport const {{TOPIC_NAME}} = new Topic<{{EVENT_TYPE}}>(\"{{TOPIC_NAME}}\", {\n  deliveryGuarantee: \"at-least-once\",\n});",
      "language": "typescript"
    },
    {
      "path": "{{SERVICE_NAME}}/subscriber.ts",
      "content": "import { Subscription } from \"encore.dev/pubsub\";\nimport { {{TOPIC_NAME}}, {{EVENT_TYPE}} } from \"./events\";\nimport log from \"encore.dev/log\";\n\nconst _ = new Subscription({{TOPIC_NAME}}, \"{{SUBSCRIBER_NAME}}\", {\n  handler: async (event: {{EVENT_TYPE}}) => {\n    log.info(\"processing event\", { id: event.id, userId: event.userId });\n\n    // Your event handling logic here\n    // Make sure this is idempotent (can safely run multiple times)\n\n    log.info(\"event processed\", { id: event.id });\n  },\n});",
      "language": "typescript"
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "SERVICE_NAME", "description": "Name of the service", "defaultValue": "events"},
    {"name": "TOPIC_NAME", "description": "Topic variable name", "defaultValue": "userEvents"},
    {"name": "EVENT_TYPE", "description": "TypeScript interface name for events", "defaultValue": "UserEvent"},
    {"name": "SUBSCRIBER_NAME", "description": "Subscription name", "defaultValue": "process-user-events"}
  ]'::jsonb
);

-- Email Service (Resend)
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Email Service (Resend)',
  'Encore.ts email service with Resend integration. Includes template rendering and delivery tracking.',
  'email',
  'encore.ts',
  '[
    {
      "path": "{{SERVICE_NAME}}/{{SERVICE_NAME}}.ts",
      "content": "import { api, APIError } from \"encore.dev/api\";\nimport { secret } from \"encore.dev/config\";\nimport log from \"encore.dev/log\";\n\nconst ResendAPIKey = secret(\"ResendAPIKey\");\n\ninterface SendEmailRequest {\n  to: string;\n  subject: string;\n  html: string;\n  from?: string;\n}\n\ninterface SendEmailResponse {\n  id: string;\n  success: boolean;\n}\n\nexport const sendEmail = api(\n  { method: \"POST\", path: \"/{{SERVICE_NAME}}/send\", expose: false },\n  async (req: SendEmailRequest): Promise<SendEmailResponse> => {\n    if (!req.to || !req.subject || !req.html) {\n      throw APIError.invalidArgument(\"to, subject, and html are required\");\n    }\n\n    const from = req.from || \"{{FROM_EMAIL}}\";\n\n    try {\n      const res = await fetch(\"https://api.resend.com/emails\", {\n        method: \"POST\",\n        headers: {\n          \"Content-Type\": \"application/json\",\n          Authorization: `Bearer ${ResendAPIKey()}`,\n        },\n        body: JSON.stringify({\n          from,\n          to: [req.to],\n          subject: req.subject,\n          html: req.html,\n        }),\n      });\n\n      const data = await res.json();\n\n      if (!res.ok) {\n        log.error(\"resend API error\", { status: res.status, error: data });\n        throw APIError.internal(\"failed to send email\");\n      }\n\n      log.info(\"email sent\", { to: req.to, id: data.id });\n      return { id: data.id, success: true };\n    } catch (err) {\n      const error = err instanceof Error ? err.message : String(err);\n      log.error(\"send email failed\", { error });\n      throw APIError.internal(\"email delivery failed\");\n    }\n  }\n);",
      "language": "typescript"
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "SERVICE_NAME", "description": "Name of the email service", "defaultValue": "email"},
    {"name": "FROM_EMAIL", "description": "Default sender email address", "defaultValue": "noreply@example.com"}
  ]'::jsonb
);

-- Dashboard Layout
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Dashboard Layout',
  'Next.js dashboard layout with sidebar navigation, topbar, and responsive design. Mobile-friendly with hamburger menu.',
  'ui',
  'next.js',
  '[
    {
      "path": "components/DashboardLayout.tsx",
      "content": "\"use client\";\n\nimport { useState } from \"react\";\nimport { Menu, X } from \"lucide-react\";\n\ninterface Props {\n  children: React.ReactNode;\n}\n\nconst NAV_ITEMS = [\n  { label: \"Dashboard\", href: \"/\" },\n  { label: \"Projects\", href: \"/projects\" },\n  { label: \"Settings\", href: \"/settings\" },\n];\n\nexport function DashboardLayout({ children }: Props) {\n  const [sidebarOpen, setSidebarOpen] = useState(false);\n\n  return (\n    <div className=\"flex h-screen bg-gray-50\">\n      {/* Sidebar */}\n      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform md:relative md:translate-x-0 ${\n        sidebarOpen ? \"translate-x-0\" : \"-translate-x-full\"\n      }`}>\n        <div className=\"flex items-center justify-between h-16 px-4 border-b\">\n          <h1 className=\"text-xl font-semibold\">{{APP_NAME}}</h1>\n          <button onClick={() => setSidebarOpen(false)} className=\"md:hidden\">\n            <X className=\"w-5 h-5\" />\n          </button>\n        </div>\n        <nav className=\"p-4 space-y-2\">\n          {NAV_ITEMS.map((item) => (\n            <a\n              key={item.href}\n              href={item.href}\n              className=\"block px-4 py-2 rounded hover:bg-gray-100\"\n            >\n              {item.label}\n            </a>\n          ))}\n        </nav>\n      </aside>\n\n      {/* Main */}\n      <div className=\"flex-1 flex flex-col overflow-hidden\">\n        {/* Topbar */}\n        <header className=\"h-16 bg-white border-b flex items-center px-4 gap-4\">\n          <button onClick={() => setSidebarOpen(true)} className=\"md:hidden\">\n            <Menu className=\"w-5 h-5\" />\n          </button>\n          <div className=\"flex-1\"></div>\n          <div className=\"flex items-center gap-3\">\n            <span className=\"text-sm text-gray-600\">User</span>\n          </div>\n        </header>\n\n        {/* Content */}\n        <main className=\"flex-1 overflow-auto p-6\">\n          {children}\n        </main>\n      </div>\n\n      {/* Mobile overlay */}\n      {sidebarOpen && (\n        <div\n          className=\"fixed inset-0 bg-black/20 z-40 md:hidden\"\n          onClick={() => setSidebarOpen(false)}\n        />\n      )}\n    </div>\n  );\n}",
      "language": "tsx"
    }
  ]'::jsonb,
  '["lucide-react"]'::jsonb,
  '[
    {"name": "APP_NAME", "description": "Application name shown in sidebar", "defaultValue": "My App"}
  ]'::jsonb
);

-- Data Table
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Data Table',
  'Next.js data table component with sorting, filtering, and pagination. Fully typed and reusable.',
  'ui',
  'next.js',
  '[
    {
      "path": "components/DataTable.tsx",
      "content": "\"use client\";\n\nimport { useState } from \"react\";\nimport { ChevronUp, ChevronDown } from \"lucide-react\";\n\ninterface Column<T> {\n  key: keyof T;\n  label: string;\n  sortable?: boolean;\n  render?: (value: T[keyof T], row: T) => React.ReactNode;\n}\n\ninterface Props<T> {\n  data: T[];\n  columns: Column<T>[];\n  pageSize?: number;\n}\n\nexport function DataTable<T extends Record<string, unknown>>({ data, columns, pageSize = 10 }: Props<T>) {\n  const [sortKey, setSortKey] = useState<keyof T | null>(null);\n  const [sortDir, setSortDir] = useState<\"asc\" | \"desc\">(\"asc\");\n  const [page, setPage] = useState(0);\n  const [filter, setFilter] = useState(\"\");\n\n  function handleSort(key: keyof T) {\n    if (sortKey === key) {\n      setSortDir(sortDir === \"asc\" ? \"desc\" : \"asc\");\n    } else {\n      setSortKey(key);\n      setSortDir(\"asc\");\n    }\n  }\n\n  const filtered = filter\n    ? data.filter((row) =>\n        Object.values(row).some((val) =>\n          String(val).toLowerCase().includes(filter.toLowerCase())\n        )\n      )\n    : data;\n\n  const sorted = sortKey\n    ? [...filtered].sort((a, b) => {\n        const aVal = a[sortKey];\n        const bVal = b[sortKey];\n        if (aVal < bVal) return sortDir === \"asc\" ? -1 : 1;\n        if (aVal > bVal) return sortDir === \"asc\" ? 1 : -1;\n        return 0;\n      })\n    : filtered;\n\n  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);\n  const totalPages = Math.ceil(sorted.length / pageSize);\n\n  return (\n    <div className=\"space-y-3\">\n      <input\n        type=\"text\"\n        placeholder=\"Filter...\"\n        value={filter}\n        onChange={(e) => {\n          setFilter(e.target.value);\n          setPage(0);\n        }}\n        className=\"border rounded px-3 py-2 w-full max-w-sm\"\n      />\n\n      <div className=\"border rounded overflow-hidden\">\n        <table className=\"w-full\">\n          <thead className=\"bg-gray-50 border-b\">\n            <tr>\n              {columns.map((col) => (\n                <th\n                  key={String(col.key)}\n                  className=\"px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-gray-100\"\n                  onClick={() => col.sortable !== false && handleSort(col.key)}\n                >\n                  <div className=\"flex items-center gap-1\">\n                    {col.label}\n                    {sortKey === col.key && (\n                      sortDir === \"asc\" ? <ChevronUp className=\"w-4 h-4\" /> : <ChevronDown className=\"w-4 h-4\" />\n                    )}\n                  </div>\n                </th>\n              ))}\n            </tr>\n          </thead>\n          <tbody>\n            {paged.map((row, i) => (\n              <tr key={i} className=\"border-b hover:bg-gray-50\">\n                {columns.map((col) => (\n                  <td key={String(col.key)} className=\"px-4 py-3 text-sm\">\n                    {col.render ? col.render(row[col.key], row) : String(row[col.key])}\n                  </td>\n                ))}\n              </tr>\n            ))}\n          </tbody>\n        </table>\n      </div>\n\n      {totalPages > 1 && (\n        <div className=\"flex items-center justify-between text-sm\">\n          <span className=\"text-gray-600\">Page {page + 1} of {totalPages}</span>\n          <div className=\"flex gap-2\">\n            <button\n              onClick={() => setPage(page - 1)}\n              disabled={page === 0}\n              className=\"px-3 py-1 border rounded disabled:opacity-50\"\n            >\n              Previous\n            </button>\n            <button\n              onClick={() => setPage(page + 1)}\n              disabled={page >= totalPages - 1}\n              className=\"px-3 py-1 border rounded disabled:opacity-50\"\n            >\n              Next\n            </button>\n          </div>\n        </div>\n      )}\n    </div>\n  );\n}",
      "language": "tsx"
    }
  ]'::jsonb,
  '["lucide-react"]'::jsonb,
  '[]'::jsonb
);
