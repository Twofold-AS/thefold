import { describe, it, expect, beforeEach } from "vitest";
import { listSkills, createSkill, toggleSkill, db } from "./skills";

describe("skills category and tags filtering", () => {
  beforeEach(async () => {
    // Clean up test data
    await db.exec`DELETE FROM skills WHERE name LIKE 'Test%'`;
  });

  it("listSkills without category/tags returns all skills (backward compatible)", async () => {
    // Create test skills with different categories and tags
    await createSkill({
      name: "Test Framework Skill",
      description: "A framework skill for testing",
      promptFragment: "Use framework patterns",
      appliesTo: ["coding"],
      scope: "global",
      taskPhase: "all",
    });

    await createSkill({
      name: "Test Security Skill",
      description: "A security skill for testing",
      promptFragment: "Apply security best practices",
      appliesTo: ["coding"],
      scope: "global",
      taskPhase: "all",
    });

    // List without filters - should return at least our test skills
    const result = await listSkills({});

    expect(result.skills.length).toBeGreaterThanOrEqual(2);
    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    expect(testSkills.length).toBe(2);
  });

  it("listSkills with category='framework' returns only framework skills", async () => {
    // Create skills with different categories
    const frameworkSkill = await createSkill({
      name: "Test Framework Only",
      description: "Framework category skill",
      promptFragment: "Framework prompt",
      appliesTo: ["coding"],
    });

    const securitySkill = await createSkill({
      name: "Test Security Only",
      description: "Security category skill",
      promptFragment: "Security prompt",
      appliesTo: ["coding"],
    });

    // Update categories manually via SQL since createSkill doesn't accept category
    await db.exec`UPDATE skills SET category = 'framework' WHERE id = ${frameworkSkill.skill.id}`;
    await db.exec`UPDATE skills SET category = 'security' WHERE id = ${securitySkill.skill.id}`;

    // Filter by framework category
    const result = await listSkills({ category: "framework" });

    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    expect(testSkills.length).toBe(1);
    expect(testSkills[0].name).toBe("Test Framework Only");
    expect(testSkills[0].category).toBe("framework");
  });

  it("listSkills with tags=['encore'] returns skills with encore tag", async () => {
    // Create skills with different tags
    const encoreSkill = await createSkill({
      name: "Test Encore Skill",
      description: "Skill with encore tag",
      promptFragment: "Use Encore.ts",
      appliesTo: ["coding"],
    });

    const reactSkill = await createSkill({
      name: "Test React Skill",
      description: "Skill with react tag",
      promptFragment: "Use React",
      appliesTo: ["coding"],
    });

    // Update tags manually via SQL
    await db.exec`UPDATE skills SET tags = ARRAY['encore', 'typescript'] WHERE id = ${encoreSkill.skill.id}`;
    await db.exec`UPDATE skills SET tags = ARRAY['react', 'javascript'] WHERE id = ${reactSkill.skill.id}`;

    // Filter by encore tag
    const result = await listSkills({ tags: ["encore"] });

    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    expect(testSkills.length).toBe(1);
    expect(testSkills[0].name).toBe("Test Encore Skill");
    expect(testSkills[0].tags).toContain("encore");
  });

  it("listSkills with category + tags combined filters correctly", async () => {
    // Create skills with various combinations
    const skill1 = await createSkill({
      name: "Test Framework Encore",
      description: "Framework + encore",
      promptFragment: "Framework with Encore",
      appliesTo: ["coding"],
    });

    const skill2 = await createSkill({
      name: "Test Framework React",
      description: "Framework + react",
      promptFragment: "Framework with React",
      appliesTo: ["coding"],
    });

    const skill3 = await createSkill({
      name: "Test Security Encore",
      description: "Security + encore",
      promptFragment: "Security with Encore",
      appliesTo: ["coding"],
    });

    // Update categories and tags
    await db.exec`UPDATE skills SET category = 'framework', tags = ARRAY['encore', 'typescript'] WHERE id = ${skill1.skill.id}`;
    await db.exec`UPDATE skills SET category = 'framework', tags = ARRAY['react', 'javascript'] WHERE id = ${skill2.skill.id}`;
    await db.exec`UPDATE skills SET category = 'security', tags = ARRAY['encore', 'security'] WHERE id = ${skill3.skill.id}`;

    // Filter by both framework category AND encore tag
    const result = await listSkills({ category: "framework", tags: ["encore"] });

    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    expect(testSkills.length).toBe(1);
    expect(testSkills[0].name).toBe("Test Framework Encore");
    expect(testSkills[0].category).toBe("framework");
    expect(testSkills[0].tags).toContain("encore");
  });

  it("listSkills with category + context + enabledOnly combined", async () => {
    // Create skills with different combinations
    const enabledSkill = await createSkill({
      name: "Test Enabled Coding Framework",
      description: "Enabled skill for coding with framework category",
      promptFragment: "Enabled prompt",
      appliesTo: ["coding"],
    });

    const disabledSkill = await createSkill({
      name: "Test Disabled Coding Framework",
      description: "Disabled skill for coding with framework category",
      promptFragment: "Disabled prompt",
      appliesTo: ["coding"],
    });

    const wrongContextSkill = await createSkill({
      name: "Test Planning Framework",
      description: "Framework skill for planning context",
      promptFragment: "Planning prompt",
      appliesTo: ["planning"],
    });

    // Update categories and enabled status
    await db.exec`UPDATE skills SET category = 'framework', enabled = TRUE WHERE id = ${enabledSkill.skill.id}`;
    await db.exec`UPDATE skills SET category = 'framework', enabled = FALSE WHERE id = ${disabledSkill.skill.id}`;
    await db.exec`UPDATE skills SET category = 'framework', enabled = TRUE WHERE id = ${wrongContextSkill.skill.id}`;

    // Filter by category + context + enabled
    const result = await listSkills({
      category: "framework",
      context: "coding",
      enabledOnly: true,
    });

    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    expect(testSkills.length).toBe(1);
    expect(testSkills[0].name).toBe("Test Enabled Coding Framework");
    expect(testSkills[0].category).toBe("framework");
    expect(testSkills[0].appliesTo).toContain("coding");
    expect(testSkills[0].enabled).toBe(true);
  });

  it("listSkills with tags array overlap (multiple tags)", async () => {
    // Create skills with different tag combinations
    const skill1 = await createSkill({
      name: "Test TypeScript Encore",
      description: "Has both typescript and encore tags",
      promptFragment: "TS + Encore",
      appliesTo: ["coding"],
    });

    const skill2 = await createSkill({
      name: "Test TypeScript Only",
      description: "Has only typescript tag",
      promptFragment: "TS only",
      appliesTo: ["coding"],
    });

    const skill3 = await createSkill({
      name: "Test JavaScript",
      description: "Has javascript tag",
      promptFragment: "JS",
      appliesTo: ["coding"],
    });

    // Update tags
    await db.exec`UPDATE skills SET tags = ARRAY['typescript', 'encore', 'backend'] WHERE id = ${skill1.skill.id}`;
    await db.exec`UPDATE skills SET tags = ARRAY['typescript', 'frontend'] WHERE id = ${skill2.skill.id}`;
    await db.exec`UPDATE skills SET tags = ARRAY['javascript', 'frontend'] WHERE id = ${skill3.skill.id}`;

    // Filter by multiple tags - should match skills with ANY of these tags
    const result = await listSkills({ tags: ["typescript", "backend"] });

    const testSkills = result.skills.filter((s) => s.name.startsWith("Test"));
    // Should match skill1 (has both) and skill2 (has typescript)
    expect(testSkills.length).toBe(2);
    const names = testSkills.map((s) => s.name).sort();
    expect(names).toEqual(["Test TypeScript Encore", "Test TypeScript Only"]);
  });
});
