# TheFold Design Tokens — Firecrawl-Inspired

## Reference
Based on Firecrawl's branding (scraped 2026-02-24):

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| heat-100 | #FF4C00 | Firecrawl primary CTA |
| tf-heat | #355872 | TheFold brand blue |
| tf-heat-light | #7aaace | Hover, glow, secondary |
| bg-base | #0A0A0A | Page background |
| bg-lighter | #141414 | Sidebar/elevated bg |
| surface | #171717 | Card background |
| surface-raised | #1F1F1F | Hovered card, input bg |
| surface-overlay | #252525 | Dropdown, popover |
| border-faint | #2A2A2A | Default borders |
| border-muted | #333333 | Focused borders |
| border-loud | #404040 | Emphasized borders |
| text-primary | #F5F5F5 | Headings, primary |
| text-secondary | rgba(255,255,255,0.72) | Body text |
| text-muted | rgba(255,255,255,0.56) | Labels, secondary |
| text-faint | rgba(255,255,255,0.32) | Hints, timestamps |
| success | #42C366 | Green status |
| warning | #ECB730 | Yellow status |
| error | #EB3424 | Red status |
| info | #2A6DFB | Blue accent |

### Typography
| Class | Font | Weight | Size/Line |
|-------|------|--------|-----------|
| display-lg | ABC Diatype Plus | 500 | 40/44 |
| display-md | ABC Diatype Plus | 500 | 24/32 |
| display-sm | ABC Diatype Plus | 450 | 20/28 |
| body | Inter | 400 | 14/1.5 |
| label | Inter | 500 | 11/caps |
| mono | Courier New | 400 | 12/1.4 |
| logotype | TheFold Brand | 400 | 18 |

### Spacing
| Token | Value |
|-------|-------|
| sidebar | 256px |
| sidebar-collapsed | 60px |
| topbar | 56px |
| container | 1112px |
| radius | 8px |
| radius-sm | 4px |

### Firecrawl Design Patterns
- Buttons: rounded-full (pill), active:scale-[0.98], layered inset shadows
- Inputs: bg-surface, rounded-8, focus border heat
- Cards: border-faint, rounded-8, hover:border-muted transition
- Tags: monospace, bg heat-8, color heat
- Decorative: corner ornament SVGs (star crosshatch)
- Vertical border lines for framing
- Dark mode only (no light toggle in dashboard)

### Animations
- skeleton-shimmer: 1.5s ease-in-out infinite
- logoGlow: 2s ease-in-out infinite (drop-shadow)
- progressPulse: 1.5s ease-in-out infinite (scale + opacity)
- messageIn: 0.3s ease-out (translateY)
- fadeIn: 0.3s ease-out (translateY + opacity)
- spin: 0.7s linear infinite (spinner)
