"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { storeMemory } from "@/lib/api";

export default function RepoMemoryPage() {
  const params = useParams<{ name: string }>();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);

  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [storing, setStoring] = useState(false);
  const [storeSuccess, setStoreSuccess] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearched(true);
  }

  async function handleStore(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;

    setStoring(true);
    setStoreSuccess(false);
    try {
      await storeMemory(newContent.trim(), newCategory);
      setStoreSuccess(true);
      setNewContent("");
    } catch {
      // Silent
    } finally {
      setStoring(false);
    }
  }

  return (
    <div>
      <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
        Memory
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Semantic memory for {params.name}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div>
          <h2 className="font-heading text-lg font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Search Memories
          </h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What are you looking for?" className="input-field flex-1" />
            <button type="submit" className="btn-secondary">Search</button>
          </form>
          {searched && (
            <div className="mt-4">
              <div className="code-block code-block-blue">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Memory search uses an internal API endpoint. Will be connected in the next iteration.
                </p>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-heading text-lg font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Store Memory
          </h2>
          <form onSubmit={handleStore} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="input-field" style={{ width: "auto" }}>
                <option value="general">General</option>
                <option value="decision">Decision</option>
                <option value="pattern">Pattern</option>
                <option value="conversation">Conversation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Content</label>
              <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Enter something TheFold should remember..." rows={4} className="input-field" style={{ resize: "vertical" }} />
            </div>
            {storeSuccess && (
              <div className="text-sm px-3 py-2" style={{ color: "var(--success)", background: "rgba(34, 197, 94, 0.1)", borderLeft: "3px solid var(--success)" }}>
                Memory stored
              </div>
            )}
            <button type="submit" disabled={storing || !newContent.trim()} className="btn-primary">
              {storing ? "Storing..." : "Store memory"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
