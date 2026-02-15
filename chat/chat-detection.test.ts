import { describe, it, expect } from "vitest";
import { detectProjectRequest } from "./detection";

describe("Chat - Project Detection Heuristics", () => {
  it("short message is NOT a project request", () => {
    expect(detectProjectRequest("Fiks bugen i login")).toBe(false);
  });

  it("simple question is NOT a project request", () => {
    expect(detectProjectRequest("Hva er status på oppgaven?")).toBe(false);
  });

  it("explicit prosjekt: prefix IS a project request", () => {
    expect(detectProjectRequest("prosjekt: Bygg et nytt CRM-system")).toBe(true);
  });

  it("long message with multiple systems IS a project request", () => {
    const msg = `Bygg et komplett brukeradministrasjonssystem med følgende:
    - En database med brukertabell og rolletabell
    - Et API med endepunkter for CRUD av brukere
    - En frontend side med registreringsskjema og brukerlistevisning
    - Autentisering med JWT tokens
    - Autorisering med rollebasert tilgangskontroll
    - En admin-side for å administrere brukere og roller
    - E-post-varsling ved registrering
    - Logging av alle brukerhandlinger

    Systemet skal bruke Encore.ts for backend og Next.js for frontend.
    Det skal ha god testdekning og dokumentasjon.
    Lag også en CI/CD-pipeline for automatisk deploy.`;
    expect(detectProjectRequest(msg)).toBe(true);
  });

  it("medium message with build word and multiple features IS a project request", () => {
    const msg = `Implementer et komplett system med API og frontend og database.
    Det trenger autentisering med OTP og en admin-side med brukeradministrasjon.
    Lag også en monitor-service med health checks og automatiske alerts.`;
    expect(detectProjectRequest(msg)).toBe(true);
  });

  it("medium message without build intent is NOT a project request", () => {
    const msg = `Jeg lurer på hvordan systemet fungerer med API og frontend og database.
    Kan du forklare arkitekturen og hvordan tjenestene kommuniserer med hverandre?
    Jeg vil gjerne forstå flyten bedre.`;
    expect(detectProjectRequest(msg)).toBe(false);
  });

  it("handles English messages with build intent", () => {
    const msg = `Build a complete e-commerce platform with the following components:
    - A product catalog service with database and search functionality
    - A shopping cart module with session management
    - A payment processing service with Stripe integration
    - An order management system with email notifications
    - An admin dashboard frontend for managing products and orders
    - API endpoints for mobile app integration
    The system should include comprehensive testing and monitoring.`;
    expect(detectProjectRequest(msg)).toBe(true);
  });
});
