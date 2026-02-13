# TheFold Marketplace - Fremtidig Visjon

> **Status:** Dokumentert for fremtidig implementering (Phase 6+)
> **Avhengigheter:** Må ha ferdig MVP først (BYGGEPLAN-V2-OPTIMIZED.md)

---

## Konsept: TheFold som "Mor/Far" til alle prosjekter

TheFold blir ikke bare en agent, men et **self-improving ecosystem** hvor kode og løsninger deles på tvers av alle prosjekter.

### Kjerneverdi

**Problem:** Samme funksjonalitet kodes mange ganger. Bug i én løsning må fikses manuelt i alle.

**Løsning:** 
1. TheFold **ekstraherer** gjenbrukbare komponenter fra eksisterende prosjekter
2. Lagrer i sentralt **component registry** (internt "marketplace")
3. **Auto-foreslår** komponenter når du bygger noe nytt
4. **Propagerer** bug-fixes automatisk til alle prosjekter som bruker komponenten

---

## Arkitektur (High-Level)

### Ny Service: `registry/`

```typescript
// Component Registry Database Schema

CREATE TABLE components (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,              -- "otp-auth", "stripe-payment"
  category TEXT NOT NULL,                 -- "auth", "payments", "pdf", "email"
  description TEXT NOT NULL,
  
  -- Source tracking
  source_repo TEXT NOT NULL,              -- hvor kom den fra?
  source_path TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  extracted_by TEXT NOT NULL,             -- hvilken AI-modell
  
  -- Code
  files JSONB NOT NULL,                   -- [{ path, content, language }]
  dependencies JSONB DEFAULT '[]',        -- npm packages required
  encore_version TEXT,
  
  -- Metadata
  version TEXT NOT NULL DEFAULT '1.0.0',
  download_count INT DEFAULT 0,
  usage_count INT DEFAULT 0,              -- antall prosjekter
  quality_score INT DEFAULT 0,            -- 0-100 AI-assessed
  
  -- Testing
  has_tests BOOLEAN DEFAULT false,
  test_coverage DECIMAL,
  
  -- Documentation
  readme TEXT,                            -- auto-generert
  examples JSONB DEFAULT '[]',
  
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE component_usage (
  id UUID PRIMARY KEY,
  component_id UUID REFERENCES components(id),
  repo_name TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  version TEXT NOT NULL,
  status TEXT DEFAULT 'active'            -- active | deprecated | replaced
);

CREATE TABLE component_bugs (
  id UUID PRIMARY KEY,
  component_id UUID REFERENCES components(id),
  reported_from_repo TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  environment JSONB,
  status TEXT DEFAULT 'open',             -- open | investigating | fixed
  fixed_in_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE component_upgrades (
  id UUID PRIMARY KEY,
  component_id UUID REFERENCES components(id),
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  changelog TEXT NOT NULL,
  breaking_changes BOOLEAN DEFAULT false,
  affected_repos TEXT[] DEFAULT '{}',
  auto_upgrade_safe BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Workflows

### 1. Component Extraction

**Trigger:** 
- PR merged som legger til ny funksjonalitet
- Manuell kommando: "TheFold, extract components from this repo"
- Scheduled: Weekly scan av alle repos

**Process:**
```typescript
async function extractComponents(repo: string) {
  // 1. Scan kodebase for gjenbrukbare patterns
  const candidates = await ai.identifyReusableComponents({
    repo,
    criteria: {
      minLines: 50,
      hasClearInterface: true,
      lowCoupling: true,
      selfContained: true
    }
  });
  
  // 2. Vurder kvalitet
  for (const candidate of candidates) {
    const quality = await ai.assessComponentQuality({
      code: candidate.code,
      criteria: ["readability", "testability", "security", "documentation"]
    });
    
    // 3. Hvis god nok → registrer
    if (quality.score > 70) {
      await registry.register({
        name: candidate.suggestedName,
        sourceRepo: repo,
        files: candidate.files,
        qualityScore: quality.score,
        readme: await ai.generateComponentDocs(candidate)
      });
    }
  }
}
```

**Eksempler på komponenter som vil bli ekstrahert:**
- OTP Auth System (fra TheFold selv)
- Stripe Payment Intent Flow
- PDF Generation with Puppeteer
- Email Templates (Resend)
- Audit Logging System
- Multi-model AI Router

---

### 2. Smart Installation

**Scenario:** Du bygger ny SaaS, trenger Stripe payment.

**OLD way:**
```
"Implement Stripe payment checkout"
→ Agent writes from scratch (500+ lines)
→ 30K tokens, 10 min, potential bugs
```

**NEW way with Marketplace:**
```
"Implement Stripe payment checkout"
→ Agent searches registry: "stripe payment"
→ Finds "stripe-payment-intent-v2" (used in 3 projects, quality=92)
→ Installs component + adapts to your project structure
→ 5K tokens, 2 min, battle-tested code
```

**Implementation:**
```typescript
// In agent planning phase
const plan = await ai.planTask({
  task: "Add Stripe payment",
  availableComponents: await registry.search("stripe payment checkout")
});

// Plan includes:
{
  "steps": [
    {
      "action": "install_component",
      "component_id": "stripe-payment-intent-v2",
      "reason": "Already tested in prod, saves development time",
      "adaptations": [
        "Update webhook URL to match project structure",
        "Add custom error handling for EUR currency"
      ]
    }
  ]
}
```

---

### 3. Bug Propagation (Game Changer)

**Scenario:** Customer i `project-alpha` rapporterer bug i Stripe payment.

**Flow:**
```
1. Bug kommer inn (via Sentry, error log, eller manuell rapport)
2. TheFold identifiserer at feilen er i "stripe-payment-intent-v2" komponenten
3. Finner alle prosjekter som bruker denne komponenten:
   → project-alpha (der feilen oppstod)
   → project-beta (bruker samme komponent)
   → project-gamma (bruker samme komponent)
4. Agent fikser bug i komponenten
5. Validerer fix i sandbox
6. Releaser ny versjon: v2.1.0
7. AUTOMATISK lager PRs i ALLE 3 prosjekter
8. Sender notifikasjon: "Bug fix available for stripe-payment"
9. Hvis non-breaking → auto-merge etter tests pass
10. Linear tasks oppdateres i alle prosjekter
```

**Resultat:**
- ✅ Bug fikset én gang
- ✅ 3 prosjekter får fix automatisk
- ✅ Ingen manuelt arbeid
- ✅ Konsistent kode på tvers av alle prosjekter

---

## Frontend Pages

### `/marketplace` - Component Browser

**Layout:**
```
Search bar: "Search components (e.g. 'auth', 'payment')"

Filters:
- Category (auth, payments, pdf, email, etc)
- Quality score (>80, >90)
- Usage (popular, new, experimental)
- Has tests (yes/no)

Grid of ComponentCards:
┌─────────────────────────────────┐
│ 🔐 OTP Auth System              │
│ Quality: 95 | Used in 5 projects│
│ "Secure email-based auth with   │
│  rate limiting and audit log"   │
│ Tags: auth, security, typescript│
│ [View Details] [Install]        │
└─────────────────────────────────┘
```

### `/component/[id]` - Component Details

**Sections:**
1. **Overview**
   - Description
   - Quality metrics
   - Usage stats ("Used in 5 projects")
   - Version history

2. **Code Viewer**
   - Browse source files
   - Syntax highlighting
   - Download as ZIP

3. **Documentation**
   - Auto-generated README
   - Installation guide
   - Code examples
   - API reference

4. **Usage**
   - List of projects using this component
   - Links to PRs where it was installed

5. **Health**
   - Open bugs (if any)
   - Test coverage
   - Last updated

6. **Install**
   - One-click install to selected repo
   - Preview adaptations needed
   - Estimated installation time

---

## Dashboard Updates

### `/home` - Add Marketplace Widget

```
Recent Components (top 3 by quality):
- stripe-payment-v2 → Used in 3 projects
- pdf-generator-v1 → Used in 2 projects  
- otp-auth-v1 → Used in 5 projects

[Browse All Components →]
```

### `/repo/[name]/components` - Components in This Repo

**Shows:**
- Components installed in this repo
- Versions
- Update available? (Yes/No)
- Last updated

**Actions:**
- Update to latest version
- Remove component
- View component details

---

## Mobile Integration

**When we build mobile app, marketplace features:**

1. **Browse Components**
   - Swipe through component cards
   - Search by category
   - View details

2. **Install via Voice**
   - "TheFold, add Stripe payment to the SaaS project"
   - → Finds component, asks for confirmation, installs

3. **Bug Notifications**
   - Push: "Bug fix available for otp-auth in 3 projects"
   - Swipe to approve auto-upgrade

4. **Component Stats**
   - Most used components
   - Quality trends
   - Usage growth

---

## Competitive Analysis

### What Competitors DON'T Have

**Devin:** No component reuse system - writes everything from scratch
**Sweep:** Single-repo focus - can't share across projects  
**MetaGPT:** No production bug propagation - each project isolated
**ClickUp Codegen:** Closed ecosystem - can't extract your own patterns

### What TheFold WILL Have

1. **Self-Learning** - Every project teaches TheFold
2. **Zero Duplication** - Same code never written twice
3. **Auto-Propagation** - One fix helps all projects
4. **Battle-Tested by Default** - Only install prod-proven components
5. **Cost Efficiency** - Installing component = 90% cheaper than writing

---

## Implementation Priority

**Phase 6** (Post-MVP, Week 2-3):
1. Registry service + database
2. Component extraction pipeline
3. Dashboard `/marketplace` page

**Phase 7** (Week 3-4):
4. Smart installation during planning
5. Usage tracking
6. Component detail pages

**Phase 8** (Week 4-5):
7. Bug reporting from production
8. Auto-propagation of fixes
9. Version management
10. Breaking change detection

**Phase 9** (Week 5-6):
11. Component quality scoring (ML)
12. Dependency graph visualization
13. Auto-deprecation warnings
14. Cross-project analytics

---

## Success Metrics (Future)

**Adoption:**
- [ ] 50+ components extracted from existing projects
- [ ] 80% of new projects use ≥3 marketplace components
- [ ] Average component used in 4+ projects

**Efficiency:**
- [ ] 70% reduction in duplicate code writing
- [ ] 90% faster implementation with components vs from-scratch
- [ ] Bug fix propagation to all affected projects in <1 hour

**Quality:**
- [ ] Average component quality score >85
- [ ] 95% of components have tests
- [ ] 0 security vulnerabilities in marketplace components

---

## Technical Notes

### Database Sizing

**Estimated storage:**
- 100 components × 50KB avg = 5MB code
- Metadata + usage tracking = 10MB
- Total: ~15MB (negligible)

### Performance

**Search:**
- Full-text search on name, description, tags
- Vector search on component embeddings for semantic matching
- Cache popular searches in Redis

**Extraction:**
- Run weekly as low-priority background job
- Don't block agent operations
- Queue-based processing

---

## Open Questions (To Resolve Later)

1. **Component Versioning:**
   - Semantic versioning (major.minor.patch)?
   - How to handle breaking changes gracefully?

2. **Conflicts:**
   - What if two repos have different versions of same component?
   - Merge strategy for conflicting adaptations?

3. **Permissions:**
   - Can any project install any component?
   - Private components (repo-specific)?

4. **Testing:**
   - Run component tests in target project context?
   - How to ensure component works across different setups?

5. **Licensing:**
   - All components internal (private)?
   - Future: public marketplace for sharing with other companies?

---

## Summary

**Marketplace = TheFold's Secret Weapon**

While competitors focus on better code generation, TheFold focuses on **never generating the same code twice**.

This creates a compounding advantage:
- Project 1 builds auth → Project 2 reuses it instantly
- Project 2 adds payments → Project 3 gets it for free
- Bug in Project 1 fixed → All projects benefit

Over time, TheFold becomes exponentially faster as the component library grows.

**The more you use TheFold, the better it gets.**

That's the vision. Let's build the MVP first, then make this real.
