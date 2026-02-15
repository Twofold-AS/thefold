import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { list, get, install, uninstall, configure, installed } from "./mcp";

describe("MCP Service", () => {
  // --- Pre-seed verification ---

  describe("pre-seed", () => {
    it("should have 6 pre-seeded servers", async () => {
      const result = await list();
      expect(result.servers.length).toBe(6);
    });

    it("should have correct server names", async () => {
      const result = await list();
      const names = result.servers.map((s) => s.name).sort();
      expect(names).toEqual([
        "brave-search",
        "context7",
        "filesystem",
        "github",
        "postgres",
        "puppeteer",
      ]);
    });

    it("should have context7 pre-installed", async () => {
      const result = await list();
      const context7 = result.servers.find((s) => s.name === "context7");
      expect(context7).toBeDefined();
      expect(context7!.status).toBe("installed");
      expect(context7!.installedAt).toBeNull(); // pre-seeded without installed_at
    });

    it("should have correct categories", async () => {
      const result = await list();
      const categories = new Set(result.servers.map((s) => s.category));
      expect(categories).toContain("code");
      expect(categories).toContain("data");
      expect(categories).toContain("docs");
      expect(categories).toContain("general");
    });
  });

  // --- CRUD ---

  describe("get", () => {
    it("should return a server by ID", async () => {
      const all = await list();
      const first = all.servers[0];

      const result = await get({ id: first.id });
      expect(result.server.id).toBe(first.id);
      expect(result.server.name).toBe(first.name);
    });

    it("should throw not_found for non-existent ID", async () => {
      await expect(
        get({ id: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow("not found");
    });

    it("should throw invalid_argument for empty ID", async () => {
      await expect(get({ id: "" })).rejects.toThrow("id is required");
    });
  });

  // --- Install / Uninstall ---

  describe("install", () => {
    it("should install an available server", async () => {
      const all = await list();
      const available = all.servers.find((s) => s.status === "available");
      expect(available).toBeDefined();

      const result = await install({ id: available!.id });
      expect(result.server.status).toBe("installed");
      expect(result.server.installedAt).not.toBeNull();

      // Cleanup
      await uninstall({ id: available!.id });
    });

    it("should reject installing already installed server", async () => {
      const all = await list();
      const context7 = all.servers.find((s) => s.name === "context7");
      expect(context7).toBeDefined();

      await expect(install({ id: context7!.id })).rejects.toThrow(
        "already installed"
      );
    });

    it("should save envVars on install", async () => {
      const all = await list();
      const available = all.servers.find((s) => s.status === "available");
      expect(available).toBeDefined();

      const result = await install({
        id: available!.id,
        envVars: { API_KEY: "test-key-123" },
      });
      expect(result.server.envVars).toEqual({ API_KEY: "test-key-123" });

      // Cleanup
      await uninstall({ id: available!.id });
    });

    it("should reject non-existent server", async () => {
      await expect(
        install({ id: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow("not found");
    });
  });

  describe("uninstall", () => {
    it("should uninstall an installed server", async () => {
      const all = await list();
      const available = all.servers.find((s) => s.status === "available");
      expect(available).toBeDefined();

      await install({ id: available!.id });
      const result = await uninstall({ id: available!.id });
      expect(result.server.status).toBe("available");
      expect(result.server.installedAt).toBeNull();
    });

    it("should reject uninstalling available server", async () => {
      const all = await list();
      const available = all.servers.find((s) => s.status === "available");
      expect(available).toBeDefined();

      await expect(uninstall({ id: available!.id })).rejects.toThrow(
        "not installed"
      );
    });
  });

  // --- Configure ---

  describe("configure", () => {
    it("should update envVars", async () => {
      const all = await list();
      const server = all.servers[0];

      const result = await configure({
        id: server.id,
        envVars: { NEW_VAR: "new-value" },
      });
      expect(result.server.envVars).toEqual({ NEW_VAR: "new-value" });
    });

    it("should update config", async () => {
      const all = await list();
      const server = all.servers[0];

      const result = await configure({
        id: server.id,
        config: { timeout: 30000 },
      });
      expect(result.server.config).toEqual({ timeout: 30000 });
    });

    it("should reject non-existent server", async () => {
      await expect(
        configure({
          id: "00000000-0000-0000-0000-000000000000",
          envVars: { KEY: "val" },
        })
      ).rejects.toThrow("not found");
    });
  });

  // --- Installed filter ---

  describe("installed filter", () => {
    it("should return only installed servers", async () => {
      const result = await installed();
      for (const server of result.servers) {
        expect(server.status).toBe("installed");
      }
    });

    it("should include context7 (pre-installed)", async () => {
      const result = await installed();
      const names = result.servers.map((s) => s.name);
      expect(names).toContain("context7");
    });

    it("should reflect install/uninstall changes", async () => {
      const all = await list();
      const filesystem = all.servers.find((s) => s.name === "filesystem");
      expect(filesystem).toBeDefined();

      // Install filesystem
      await install({ id: filesystem!.id });
      let result = await installed();
      expect(result.servers.map((s) => s.name)).toContain("filesystem");

      // Uninstall filesystem
      await uninstall({ id: filesystem!.id });
      result = await installed();
      expect(result.servers.map((s) => s.name)).not.toContain("filesystem");
    });
  });
});
