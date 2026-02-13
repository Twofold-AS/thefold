import { describe, it, expect, beforeAll } from "vitest";
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  toggleSkill,
  deleteSkill,
  getActiveSkills,
  previewPrompt,
} from "./skills";

describe("Skills service", () => {
  // Seed data should give us 5 built-in skills
  describe("listSkills", () => {
    it("should return seeded skills", async () => {
      const result = await listSkills({});
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
      expect(result.skills.length).toBeGreaterThanOrEqual(5);

      // Check that known seed skills exist
      const names = result.skills.map((s) => s.name);
      expect(names).toContain("Encore.ts Rules");
      expect(names).toContain("TypeScript Strict");
      expect(names).toContain("Security Awareness");
      expect(names).toContain("Norwegian Docs");
      expect(names).toContain("Test Coverage");
    });

    it("should filter by context", async () => {
      const codingSkills = await listSkills({ context: "coding" });
      expect(codingSkills.skills.length).toBeGreaterThan(0);

      // All returned skills should have 'coding' in their appliesTo
      for (const skill of codingSkills.skills) {
        expect(skill.appliesTo).toContain("coding");
      }

      const reviewSkills = await listSkills({ context: "review" });
      expect(reviewSkills.skills.length).toBeGreaterThan(0);
      for (const skill of reviewSkills.skills) {
        expect(skill.appliesTo).toContain("review");
      }
    });

    it("should filter by enabled only", async () => {
      const result = await listSkills({ enabledOnly: true });
      for (const skill of result.skills) {
        expect(skill.enabled).toBe(true);
      }
    });

    it("should filter by context + enabledOnly combined", async () => {
      const result = await listSkills({ context: "coding", enabledOnly: true });
      for (const skill of result.skills) {
        expect(skill.appliesTo).toContain("coding");
        expect(skill.enabled).toBe(true);
      }
    });
  });

  describe("getSkill", () => {
    it("should return a skill by ID", async () => {
      const all = await listSkills({});
      const first = all.skills[0];

      const result = await getSkill({ id: first.id });
      expect(result.skill.id).toBe(first.id);
      expect(result.skill.name).toBe(first.name);
      expect(result.skill.promptFragment).toBeDefined();
      expect(result.skill.promptFragment.length).toBeGreaterThan(0);
    });

    it("should throw not_found for missing skill", async () => {
      await expect(
        getSkill({ id: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow();
    });
  });

  describe("createSkill", () => {
    it("should create a new skill", async () => {
      const result = await createSkill({
        name: "Test Skill",
        description: "A test skill for testing",
        promptFragment: "## Test\nThis is a test instruction.",
        appliesTo: ["coding", "review"],
      });

      expect(result.skill).toBeDefined();
      expect(result.skill.name).toBe("Test Skill");
      expect(result.skill.description).toBe("A test skill for testing");
      expect(result.skill.appliesTo).toContain("coding");
      expect(result.skill.appliesTo).toContain("review");
      expect(result.skill.enabled).toBe(true);
      expect(result.skill.scope).toBe("global");
      expect(result.skill.id).toBeDefined();
    });

    it("should reject invalid context values", async () => {
      await expect(
        createSkill({
          name: "Bad Skill",
          description: "test",
          promptFragment: "test",
          appliesTo: ["invalid_context"],
        })
      ).rejects.toThrow();
    });

    it("should reject empty appliesTo", async () => {
      await expect(
        createSkill({
          name: "Bad Skill",
          description: "test",
          promptFragment: "test",
          appliesTo: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("updateSkill", () => {
    it("should update a skill's name and description", async () => {
      const created = await createSkill({
        name: "Update Test",
        description: "Before update",
        promptFragment: "original fragment",
        appliesTo: ["coding"],
      });

      const updated = await updateSkill({
        id: created.skill.id,
        name: "Updated Name",
        description: "After update",
      });

      expect(updated.skill.name).toBe("Updated Name");
      expect(updated.skill.description).toBe("After update");
      expect(updated.skill.promptFragment).toBe("original fragment");
    });

    it("should throw not_found for missing skill", async () => {
      await expect(
        updateSkill({ id: "00000000-0000-0000-0000-000000000000", name: "x" })
      ).rejects.toThrow();
    });
  });

  describe("toggleSkill", () => {
    it("should toggle a skill off and on", async () => {
      const created = await createSkill({
        name: "Toggle Test",
        description: "test",
        promptFragment: "test",
        appliesTo: ["coding"],
      });

      expect(created.skill.enabled).toBe(true);

      const disabled = await toggleSkill({ id: created.skill.id, enabled: false });
      expect(disabled.skill.enabled).toBe(false);

      const enabled = await toggleSkill({ id: created.skill.id, enabled: true });
      expect(enabled.skill.enabled).toBe(true);
    });
  });

  describe("deleteSkill", () => {
    it("should delete a skill", async () => {
      const created = await createSkill({
        name: "Delete Me",
        description: "test",
        promptFragment: "test",
        appliesTo: ["coding"],
      });

      const result = await deleteSkill({ id: created.skill.id });
      expect(result.success).toBe(true);

      // Verify it's gone
      await expect(getSkill({ id: created.skill.id })).rejects.toThrow();
    });

    it("should throw not_found for missing skill", async () => {
      await expect(
        deleteSkill({ id: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow();
    });
  });

  describe("getActiveSkills", () => {
    it("should return only enabled skills for a context", async () => {
      const result = await getActiveSkills({ context: "coding" });

      expect(result.skills).toBeDefined();
      expect(result.promptFragments).toBeDefined();
      expect(result.skills.length).toBe(result.promptFragments.length);

      for (const skill of result.skills) {
        expect(skill.enabled).toBe(true);
        expect(skill.appliesTo).toContain("coding");
      }

      // Prompt fragments should have content
      for (const fragment of result.promptFragments) {
        expect(fragment.length).toBeGreaterThan(0);
      }
    });

    it("should return different skills for different contexts", async () => {
      const coding = await getActiveSkills({ context: "coding" });
      const review = await getActiveSkills({ context: "review" });

      // Both should have results but potentially different skills
      expect(coding.skills.length).toBeGreaterThan(0);
      expect(review.skills.length).toBeGreaterThan(0);

      // Norwegian Docs applies to review only
      const codingNames = coding.skills.map((s) => s.name);
      const reviewNames = review.skills.map((s) => s.name);
      expect(reviewNames).toContain("Norwegian Docs");
      expect(codingNames).not.toContain("Norwegian Docs");
    });
  });

  describe("previewPrompt", () => {
    it("should return a preview with active skills", async () => {
      const result = await previewPrompt({ context: "coding" });

      expect(result.systemPrompt).toBeDefined();
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.activeSkillCount).toBeGreaterThan(0);
      expect(result.activeSkillNames.length).toBe(result.activeSkillCount);
      expect(result.activeSkillNames).toContain("Encore.ts Rules");
    });

    it("should reject invalid context", async () => {
      await expect(
        previewPrompt({ context: "invalid" })
      ).rejects.toThrow();
    });
  });
});
