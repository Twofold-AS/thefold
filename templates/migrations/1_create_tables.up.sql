CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  framework TEXT DEFAULT 'next.js',
  files JSONB NOT NULL DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  variables JSONB DEFAULT '[]',
  use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: Contact Form
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Contact Form',
  'React contact form with zod validation and react-hook-form. Includes email field, message textarea, and submit handler.',
  'form',
  'next.js',
  '[
    {
      "path": "components/ContactForm.tsx",
      "content": "\"use client\";\n\nimport { useForm } from \"react-hook-form\";\nimport { zodResolver } from \"@hookform/resolvers/zod\";\nimport { z } from \"zod\";\nimport { useState } from \"react\";\n\nconst schema = z.object({\n  name: z.string().min(2, \"Navn må være minst 2 tegn\"),\n  email: z.string().email(\"Ugyldig e-postadresse\"),\n  message: z.string().min(10, \"Meldingen må være minst 10 tegn\"),\n});\n\ntype FormData = z.infer<typeof schema>;\n\nexport function ContactForm() {\n  const [submitted, setSubmitted] = useState(false);\n  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({\n    resolver: zodResolver(schema),\n  });\n\n  async function onSubmit(data: FormData) {\n    const res = await fetch(\"/api/{{API_ROUTE}}\", {\n      method: \"POST\",\n      headers: { \"Content-Type\": \"application/json\" },\n      body: JSON.stringify(data),\n    });\n    if (res.ok) setSubmitted(true);\n  }\n\n  if (submitted) return <p>Takk for meldingen!</p>;\n\n  return (\n    <form onSubmit={handleSubmit(onSubmit)} className=\"space-y-4 max-w-md\">\n      <div>\n        <label className=\"block text-sm font-medium mb-1\">Navn</label>\n        <input {...register(\"name\")} className=\"w-full border rounded px-3 py-2\" />\n        {errors.name && <p className=\"text-red-500 text-xs mt-1\">{errors.name.message}</p>}\n      </div>\n      <div>\n        <label className=\"block text-sm font-medium mb-1\">E-post</label>\n        <input {...register(\"email\")} type=\"email\" className=\"w-full border rounded px-3 py-2\" />\n        {errors.email && <p className=\"text-red-500 text-xs mt-1\">{errors.email.message}</p>}\n      </div>\n      <div>\n        <label className=\"block text-sm font-medium mb-1\">Melding</label>\n        <textarea {...register(\"message\")} rows={4} className=\"w-full border rounded px-3 py-2\" />\n        {errors.message && <p className=\"text-red-500 text-xs mt-1\">{errors.message.message}</p>}\n      </div>\n      <button type=\"submit\" disabled={isSubmitting} className=\"bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50\">\n        {isSubmitting ? \"Sender...\" : \"Send melding\"}\n      </button>\n    </form>\n  );\n}",
      "language": "tsx"
    }
  ]'::jsonb,
  '["zod", "react-hook-form", "@hookform/resolvers"]'::jsonb,
  '[{"name": "API_ROUTE", "description": "API endpoint for form submission", "defaultValue": "contact"}]'::jsonb
);

-- Seed: User Auth (OTP)
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'User Auth (OTP)',
  'OTP-based authentication flow with email verification. Includes login page, OTP input, and token management.',
  'auth',
  'next.js',
  '[
    {
      "path": "components/LoginForm.tsx",
      "content": "\"use client\";\n\nimport { useState } from \"react\";\n\nexport function LoginForm() {\n  const [email, setEmail] = useState(\"\");\n  const [code, setCode] = useState(\"\");\n  const [step, setStep] = useState<\"email\" | \"otp\">(\"email\");\n  const [error, setError] = useState(\"\");\n  const [loading, setLoading] = useState(false);\n\n  async function requestOtp() {\n    setLoading(true);\n    setError(\"\");\n    try {\n      const res = await fetch(\"{{API_BASE}}/auth/request-otp\", {\n        method: \"POST\",\n        headers: { \"Content-Type\": \"application/json\" },\n        body: JSON.stringify({ email }),\n      });\n      if (!res.ok) throw new Error(\"Kunne ikke sende kode\");\n      setStep(\"otp\");\n    } catch (err) {\n      setError(err instanceof Error ? err.message : \"Noe gikk galt\");\n    } finally {\n      setLoading(false);\n    }\n  }\n\n  async function verifyOtp() {\n    setLoading(true);\n    setError(\"\");\n    try {\n      const res = await fetch(\"{{API_BASE}}/auth/verify-otp\", {\n        method: \"POST\",\n        headers: { \"Content-Type\": \"application/json\" },\n        body: JSON.stringify({ email, code }),\n      });\n      const data = await res.json();\n      if (data.token) {\n        localStorage.setItem(\"token\", data.token);\n        window.location.href = \"/\";\n      } else {\n        setError(data.error || \"Ugyldig kode\");\n      }\n    } catch (err) {\n      setError(err instanceof Error ? err.message : \"Noe gikk galt\");\n    } finally {\n      setLoading(false);\n    }\n  }\n\n  return (\n    <div className=\"max-w-sm mx-auto mt-20 p-6 border rounded-lg\">\n      <h1 className=\"text-xl font-semibold mb-4\">Logg inn</h1>\n      {error && <p className=\"text-red-500 text-sm mb-3\">{error}</p>}\n      {step === \"email\" ? (\n        <div className=\"space-y-3\">\n          <input\n            type=\"email\" value={email} onChange={(e) => setEmail(e.target.value)}\n            placeholder=\"din@epost.no\" className=\"w-full border rounded px-3 py-2\"\n          />\n          <button onClick={requestOtp} disabled={loading || !email}\n            className=\"w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50\">\n            {loading ? \"Sender...\" : \"Send engangskode\"}\n          </button>\n        </div>\n      ) : (\n        <div className=\"space-y-3\">\n          <p className=\"text-sm text-gray-600\">Kode sendt til {email}</p>\n          <input\n            type=\"text\" value={code} onChange={(e) => setCode(e.target.value)}\n            placeholder=\"123456\" maxLength={6} className=\"w-full border rounded px-3 py-2 text-center tracking-widest\"\n          />\n          <button onClick={verifyOtp} disabled={loading || code.length < 6}\n            className=\"w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50\">\n            {loading ? \"Verifiserer...\" : \"Bekreft\"}\n          </button>\n          <button onClick={() => setStep(\"email\")} className=\"w-full text-sm text-gray-500 hover:underline\">\n            Tilbake\n          </button>\n        </div>\n      )}\n    </div>\n  );\n}",
      "language": "tsx"
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[{"name": "API_BASE", "description": "Base URL for auth API", "defaultValue": "http://localhost:4000"}]'::jsonb
);

-- Seed: Stripe Payment
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'Stripe Payment',
  'Stripe checkout integration with server-side session creation and client-side redirect. Includes checkout button component.',
  'payment',
  'next.js',
  '[
    {
      "path": "components/CheckoutButton.tsx",
      "content": "\"use client\";\n\nimport { useState } from \"react\";\n\ninterface Props {\n  priceId: string;\n  label?: string;\n}\n\nexport function CheckoutButton({ priceId, label = \"Betal\" }: Props) {\n  const [loading, setLoading] = useState(false);\n\n  async function handleCheckout() {\n    setLoading(true);\n    try {\n      const res = await fetch(\"/api/checkout\", {\n        method: \"POST\",\n        headers: { \"Content-Type\": \"application/json\" },\n        body: JSON.stringify({ priceId }),\n      });\n      const { url } = await res.json();\n      if (url) window.location.href = url;\n    } catch {\n      alert(\"Noe gikk galt med betalingen\");\n    } finally {\n      setLoading(false);\n    }\n  }\n\n  return (\n    <button\n      onClick={handleCheckout}\n      disabled={loading}\n      className=\"bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50\"\n    >\n      {loading ? \"Laster...\" : label}\n    </button>\n  );\n}",
      "language": "tsx"
    },
    {
      "path": "api/checkout/route.ts",
      "content": "import Stripe from \"stripe\";\nimport { NextResponse } from \"next/server\";\n\nconst stripe = new Stripe(process.env.{{STRIPE_KEY_VAR}}!, { apiVersion: \"2024-06-20\" });\n\nexport async function POST(req: Request) {\n  const { priceId } = await req.json();\n\n  const session = await stripe.checkout.sessions.create({\n    mode: \"payment\",\n    line_items: [{ price: priceId, quantity: 1 }],\n    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success`,\n    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,\n  });\n\n  return NextResponse.json({ url: session.url });\n}",
      "language": "typescript"
    }
  ]'::jsonb,
  '["stripe"]'::jsonb,
  '[{"name": "STRIPE_KEY_VAR", "description": "Environment variable name for Stripe secret key", "defaultValue": "STRIPE_SECRET_KEY"}]'::jsonb
);

-- Seed: REST API CRUD
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'REST API CRUD',
  'Encore.ts service with typed CRUD endpoints, PostgreSQL database, and migration. Ready-to-use REST API scaffold.',
  'api',
  'encore.ts',
  '[
    {
      "path": "{{SERVICE_NAME}}/{{SERVICE_NAME}}.ts",
      "content": "import { api, APIError } from \"encore.dev/api\";\nimport { db } from \"./db\";\n\ninterface Item {\n  id: string;\n  name: string;\n  description: string | null;\n  createdAt: string;\n}\n\nexport const create = api(\n  { method: \"POST\", path: \"/{{SERVICE_NAME}}/create\", expose: true, auth: true },\n  async (req: { name: string; description?: string }): Promise<{ item: Item }> => {\n    if (!req.name || req.name.trim().length === 0) {\n      throw APIError.invalidArgument(\"name is required\");\n    }\n    const row = await db.queryRow`\n      INSERT INTO items (name, description) VALUES (${req.name.trim()}, ${req.description ?? null})\n      RETURNING id, name, description, created_at\n    `;\n    if (!row) throw APIError.internal(\"failed to create item\");\n    return { item: { id: row.id as string, name: row.name as string, description: row.description as string | null, createdAt: (row.created_at as Date).toISOString() } };\n  }\n);\n\nexport const get = api(\n  { method: \"GET\", path: \"/{{SERVICE_NAME}}/get\", expose: true, auth: true },\n  async (req: { id: string }): Promise<{ item: Item }> => {\n    const row = await db.queryRow`SELECT * FROM items WHERE id = ${req.id}::uuid`;\n    if (!row) throw APIError.notFound(\"item not found\");\n    return { item: { id: row.id as string, name: row.name as string, description: row.description as string | null, createdAt: (row.created_at as Date).toISOString() } };\n  }\n);\n\nexport const list = api(\n  { method: \"GET\", path: \"/{{SERVICE_NAME}}/list\", expose: true, auth: true },\n  async (): Promise<{ items: Item[] }> => {\n    const rows = await db.query`SELECT * FROM items ORDER BY created_at DESC`;\n    const items: Item[] = [];\n    for await (const row of rows) {\n      items.push({ id: row.id as string, name: row.name as string, description: row.description as string | null, createdAt: (row.created_at as Date).toISOString() });\n    }\n    return { items };\n  }\n);\n\nexport const remove = api(\n  { method: \"POST\", path: \"/{{SERVICE_NAME}}/delete\", expose: true, auth: true },\n  async (req: { id: string }): Promise<{ success: boolean }> => {\n    await db.exec`DELETE FROM items WHERE id = ${req.id}::uuid`;\n    return { success: true };\n  }\n);",
      "language": "typescript"
    },
    {
      "path": "{{SERVICE_NAME}}/db.ts",
      "content": "import { SQLDatabase } from \"encore.dev/storage/sqldb\";\n\nexport const db = new SQLDatabase(\"{{SERVICE_NAME}}\", {\n  migrations: \"./migrations\",\n});",
      "language": "typescript"
    },
    {
      "path": "{{SERVICE_NAME}}/migrations/1_create_items.up.sql",
      "content": "CREATE TABLE items (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  description TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);",
      "language": "sql"
    }
  ]'::jsonb,
  '[]'::jsonb,
  '[{"name": "SERVICE_NAME", "description": "Name of the Encore.ts service", "defaultValue": "items"}]'::jsonb
);

-- Seed: File Upload
INSERT INTO templates (name, description, category, framework, files, dependencies, variables) VALUES (
  'File Upload',
  'Drag-and-drop file upload component with react-dropzone. Supports multiple files, file type filtering, and size limits.',
  'form',
  'next.js',
  '[
    {
      "path": "components/FileUpload.tsx",
      "content": "\"use client\";\n\nimport { useCallback, useState } from \"react\";\nimport { useDropzone } from \"react-dropzone\";\n\ninterface UploadedFile {\n  name: string;\n  size: number;\n  url?: string;\n}\n\ninterface Props {\n  maxFiles?: number;\n  maxSize?: number;\n  accept?: Record<string, string[]>;\n  onUpload?: (files: UploadedFile[]) => void;\n}\n\nexport function FileUpload({ maxFiles = 5, maxSize = 5 * 1024 * 1024, accept, onUpload }: Props) {\n  const [files, setFiles] = useState<UploadedFile[]>([]);\n  const [uploading, setUploading] = useState(false);\n  const [error, setError] = useState(\"\");\n\n  const onDrop = useCallback(async (accepted: File[]) => {\n    setUploading(true);\n    setError(\"\");\n    try {\n      const formData = new FormData();\n      accepted.forEach((f) => formData.append(\"files\", f));\n\n      const res = await fetch(\"/api/{{UPLOAD_ROUTE}}\", {\n        method: \"POST\",\n        body: formData,\n      });\n\n      if (!res.ok) throw new Error(\"Opplasting feilet\");\n      const data = await res.json();\n\n      const uploaded: UploadedFile[] = accepted.map((f, i) => ({\n        name: f.name,\n        size: f.size,\n        url: data.urls?.[i],\n      }));\n\n      setFiles((prev) => [...prev, ...uploaded]);\n      onUpload?.(uploaded);\n    } catch (err) {\n      setError(err instanceof Error ? err.message : \"Noe gikk galt\");\n    } finally {\n      setUploading(false);\n    }\n  }, [onUpload]);\n\n  const { getRootProps, getInputProps, isDragActive } = useDropzone({\n    onDrop,\n    maxFiles,\n    maxSize,\n    accept,\n  });\n\n  function formatSize(bytes: number) {\n    if (bytes < 1024) return bytes + \" B\";\n    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + \" KB\";\n    return (bytes / (1024 * 1024)).toFixed(1) + \" MB\";\n  }\n\n  return (\n    <div className=\"space-y-4\">\n      <div\n        {...getRootProps()}\n        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${\n          isDragActive ? \"border-blue-500 bg-blue-50\" : \"border-gray-300 hover:border-gray-400\"\n        }`}\n      >\n        <input {...getInputProps()} />\n        {uploading ? (\n          <p className=\"text-gray-500\">Laster opp...</p>\n        ) : isDragActive ? (\n          <p className=\"text-blue-500\">Slipp filene her...</p>\n        ) : (\n          <div>\n            <p className=\"text-gray-600\">Dra og slipp filer her, eller klikk for å velge</p>\n            <p className=\"text-xs text-gray-400 mt-1\">Maks {maxFiles} filer, {formatSize(maxSize)} per fil</p>\n          </div>\n        )}\n      </div>\n\n      {error && <p className=\"text-red-500 text-sm\">{error}</p>}\n\n      {files.length > 0 && (\n        <ul className=\"space-y-2\">\n          {files.map((f, i) => (\n            <li key={i} className=\"flex items-center gap-3 text-sm p-2 rounded bg-gray-50\">\n              <span className=\"flex-1 truncate\">{f.name}</span>\n              <span className=\"text-gray-400 text-xs\">{formatSize(f.size)}</span>\n            </li>\n          ))}\n        </ul>\n      )}\n    </div>\n  );\n}",
      "language": "tsx"
    }
  ]'::jsonb,
  '["react-dropzone"]'::jsonb,
  '[{"name": "UPLOAD_ROUTE", "description": "API route for file uploads", "defaultValue": "upload"}]'::jsonb
);
