import { describe, it, expect } from "vitest";
import { db } from "./skills";

describe("Project Conventions Skill", () => {
  it("exists in the database", async () => {
    const skill = await db.queryRow<{ name: string; enabled: boolean }>`
      SELECT name, enabled FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("Project Conventions");
  });

  it("is enabled", async () => {
    const skill = await db.queryRow<{ enabled: boolean }>`
      SELECT enabled FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill!.enabled).toBe(true);
  });

  it("has correct applies_to", async () => {
    const skill = await db.queryRow<{ applies_to: string[] }>`
      SELECT applies_to FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill!.applies_to).toContain("planning");
    expect(skill!.applies_to).toContain("coding");
    expect(skill!.applies_to).toContain("review");
  });

  it("has priority 1 (highest)", async () => {
    const skill = await db.queryRow<{ priority: number }>`
      SELECT priority FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill!.priority).toBe(1);
  });

  it("has execution_phase inject", async () => {
    const skill = await db.queryRow<{ execution_phase: string }>`
      SELECT execution_phase FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill!.execution_phase).toBe("inject");
  });

  it("has category quality", async () => {
    const skill = await db.queryRow<{ category: string }>`
      SELECT category FROM skills WHERE name = 'Project Conventions'
    `;
    expect(skill!.category).toBe("quality");
  });
});
