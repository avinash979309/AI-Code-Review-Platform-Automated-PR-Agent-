# Visual and UX Design Specification

## 1. Design Philosophy

Dark developer-tool aesthetic. Professional internal engineering tool, not consumer SaaS. Visual design inspired by GitHub Dark, Linear, and Datadog.

- Information density prioritized over whitespace.
- Low visual latency: instantaneous panel switches, zero layout shifts.
- High-contrast visual hierarchy for triage and code scanning.
- Monospace-first data visualization for code, AST identifiers, and diff coordinates.

---

## 2. Color System

### Base Colors (Dark Theme)
```css
--background:        #0a0a0b; /* near-black canvas */
--surface:           #141416; /* card / panel background */
--surface-elevated:  #1c1c1f; /* hover states / elevated modals / popovers */
--border:            #2a2a2e; /* structural borders */
--border-active:     #3a3a3f; /* focused / active borders */
```

### Text
```css
--text-primary:      #e4e4e7; /* primary headings and content (zinc-200) */
--text-secondary:    #a1a1aa; /* metadata, labels, secondary info (zinc-400) */
--text-tertiary:     #71717a; /* timestamps, placeholder, disabled (zinc-500) */
```

### Accent
```css
--accent:            #3b82f6; /* primary interactive actions (blue-500) */
--accent-hover:      #2563eb; /* active/hover state (blue-600) */
--accent-muted:      #1e3a5f; /* subtle badge / selection tint */
```

### Severity
```css
--severity-critical: #ef4444; /* red-500 (security vulnerabilities, crash bugs) */
--severity-warning:  #f59e0b; /* amber-500 (code smells, anti-patterns, performance) */
--severity-info:     #3b82f6; /* blue-500 (style consistency, docs) */
--severity-success:  #22c55e; /* green-500 (clean runs, validated fixes) */
```

### Status
```css
--status-queued:     #71717a; /* zinc-500 */
--status-running:    #3b82f6; /* blue-500 (with pulse animation) */
--status-completed:  #22c55e; /* green-500 */
--status-failed:     #ef4444; /* red-500 */
```

---

## 3. Typography

- **UI Font Family**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Code Font Family**: `"JetBrains Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace`
- **Base UI Size**: `14px` (`text-sm`)
- **Code Size**: `13px` (`text-[13px]`)
- **Headings**: `14px` semibold (`font-semibold text-sm`), compact scale (no oversized display fonts)
- **Line Heights**:
  - UI Text: `1.5` (`leading-normal`)
  - Code / Diff: `1.6` (`leading-relaxed`)
- **Letter Spacing**:
  - Headings: `-0.01em` (`tracking-tight`)
  - Code: `0` (`tracking-normal`)

---

## 4. Layout Specifications

### Dashboard Page
```
┌────────────────────────────────────────────────────────────────────────┐
│ Header: [Logo] Code Review Platform                     [Active Queue] │
├────────────────────────────────────────────────────────────────────────┤
│ Review List (Full Width, Centered, Max-Width: 1200px)                  │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ [Status: Running]   PR #42: Fix auth token validation bug          │ │
│ │ owner/auth-service · 3 findings · 2m ago                           │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ [Status: Completed] PR #41: Add user management endpoints          │ │
│ │ owner/core-api · 5 findings · 15m ago                              │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ [Status: Failed]    PR #40: Migrate schema to v2                   │ │
│ │ owner/data-layer · 0 findings · 1h ago                             │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Review Workspace Page
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: ← Back | PR #42: Fix auth token validation bug | Status: Running                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Pipeline Progress Bar: [Queued] → [Fetching] → [Sandbox] → [AST] → [Review] → [Done]    │
├──────────────────┬──────────────────────────────────────┬───────────────────────────────┤
│ Files Tree       │ Monaco Editor (Diff View)            │ Findings Panel                │
│                  │                                      │                               │
│ 📁 src           │ 40  function verifyToken(token) {    │ ┌─ Finding Card ────────────┐ │
│  ├─ 📁 auth      │ 41-   const decoded = jwt.decode(t); │ │ ⚠ WARNING                 │ │
│  │   └ 📄 jwt.ts │ 41+   const decoded = jwt.verify(t); │ │ Insecure Token Decoding   │ │
│  ├─ 📁 api       │ 42    return decoded;                │ │ src/auth/jwt.ts:41-41     │ │
│  │   └ 📄 http.ts│ 43  }                                │ │ [jwt.decode skips crypto] │ │
│  └─ 📄 index.ts  │                                      │ │ Suggestion: jwt.verify()  │ │
│                  │                                      │ └───────────────────────────┘ │
│ 240px (resizable)│ flex-1                               │ 360px (resizable)             │
└──────────────────┴──────────────────────────────────────┴───────────────────────────────┘
```

### Panel Width Constraints
- **File Tree Panel**: `240px` default (`min-w-[200px]`, `max-w-[360px]`, resizable via left drag-handle).
- **Editor Canvas**: `flex-1` (expands to fill all remaining viewport width).
- **Findings Panel**: `360px` default (`min-w-[300px]`, `max-w-[480px]`, resizable via right drag-handle).

---

## 5. Component Specifications

### Status Badge
- **Container**: Rounded pill (`rounded-full px-2.5 py-0.5 inline-flex items-center gap-1.5`)
- **Indicator**: `w-1.5 h-1.5 rounded-full` dot indicator
  - Queued: `bg-zinc-500`
  - Running: `bg-blue-500 animate-pulse`
  - Completed: `bg-emerald-500`
  - Failed: `bg-red-500`
- **Typography**: `text-xs font-medium`
- **Variants**:
  - Neutral / Queued: `bg-zinc-800 text-zinc-300 border border-zinc-700`
  - Running: `bg-blue-950/60 text-blue-300 border border-blue-800`
  - Completed: `bg-emerald-950/60 text-emerald-300 border border-emerald-800`
  - Failed: `bg-red-950/60 text-red-300 border border-red-800`

### Finding Card
- **Container**: `bg-[#141416] border border-[#2a2a2e] border-l-4 rounded-r-lg p-3 flex flex-col gap-2`
- **Border-Left Severity Encoding**:
  - Critical: `border-l-[#ef4444]`
  - Warning: `border-l-[#f59e0b]`
  - Info: `border-l-[#3b82f6]`
- **Header Line**: Severity badge/icon + Title (`text-sm font-medium text-zinc-200`)
- **Location Target**: Monospace link (`font-mono text-xs text-blue-400 hover:underline cursor-pointer`) pointing to `filePath:startLine-endLine`. Clicking focuses editor range.
- **Description**: Two-line clamped summary (`line-clamp-2 text-xs text-zinc-400`), expandable via chevron button to full text.
- **Suggestion Block**: Optional code block (`bg-[#1c1c1f] border border-[#2a2a2e] rounded p-2 text-xs font-mono text-zinc-300`).
- **Validation Status**: Small validation tag with icon:
  - Passed: Checkmark icon (`text-emerald-400 text-xs`)
  - Rejected: X icon (`text-red-400 text-xs`)

### File Tree
- **Container**: `w-full h-full overflow-y-auto bg-[#141416] border-r border-[#2a2a2e] p-2 select-none`
- **Typography**: `font-mono text-[13px] text-zinc-300`
- **Indentation**: `16px` (`pl-4`) per nesting directory level.
- **Nodes**:
  - Folder: Expand/collapse chevron + folder icon (`📁` / Lucide `Folder` / `FolderOpen`).
  - File: File extension icon (Lucide `FileCode2` / `FileText`) + filename.
- **Badge**: Finding count pill on right margin (`ml-auto px-1.5 py-0.2 rounded-full text-[11px] bg-zinc-800 text-zinc-400`).
- **States**:
  - Default: `text-zinc-400 hover:bg-[#1c1c1f] hover:text-zinc-200 rounded px-2 py-1`
  - Active/Selected: `bg-[#1e3a5f] text-blue-200 font-medium rounded px-2 py-1`

### Monaco Editor
- **Theme**: `vs-dark` (standard built-in Monaco dark theme overridden with background `#0a0a0b`).
- **Mode**: Read-only (`readOnly: true`).
- **Config**:
  - `minimap: { enabled: false }`
  - `lineNumbers: "on"`
  - `fontFamily: "JetBrains Mono", monospace`
  - `fontSize: 13`
  - `lineHeight: 21`
  - `scrollBeyondLastLine: false`
- **Decorations**:
  - Left margin glyph icon colored by severity.
  - Inline background highlight on diff chunk / finding range:
    - Critical: `rgba(239, 68, 68, 0.15)`
    - Warning: `rgba(245, 158, 11, 0.15)`
    - Info: `rgba(59, 130, 246, 0.15)`

### Status Bar (Review Workspace)
- **Position**: Fixed directly beneath top header bar, spanning workspace full width.
- **Container**: `h-10 bg-[#141416] border-b border-[#2a2a2e] px-4 flex items-center gap-2 overflow-x-auto`
- **Pipeline Stages**:
  `Queued` → `Fetching` → `Sandbox` → `AST` → `Context` → `Reviewing` → `Validating` → `Complete`
- **Step Styling**:
  - Active: Text `text-blue-400 font-medium`, indicator dot with `animate-pulse bg-blue-500`.
  - Completed: Text `text-emerald-400`, leading checkmark icon (`text-emerald-400`).
  - Pending: Text `text-zinc-600`, leading neutral circle.
- **Separator**: Right chevron icon (`text-zinc-700 w-3 h-3`).

---

## 6. Spacing System

Tailwind CSS standard scale constraints:
- **Outer Page Padding**: `p-6` (`24px`)
- **Card Padding**: `p-3` (`12px`) or `p-4` (`16px`)
- **Section Gaps**: `gap-4` (`16px`)
- **Inline / Item Gaps**: `gap-2` (`8px`)
- **Micro Gaps**: `gap-1` (`4px`)
- **Border Radii**:
  - Container Cards: `rounded-lg` (`8px`)
  - Badges, Inputs, Buttons: `rounded-md` (`6px`)
  - Status Indicators: `rounded-full` (`9999px`)

---

## 7. Animations

Minimalist transitions for developer efficiency:
- **Status Pulse**: `animate-pulse` on active/running dot indicator.
- **Finding Accordion**: `transition-all duration-200 ease-out` on card expand/collapse.
- **Panel Layout**: No animation transitions (`transition-none`) on splitter drag to eliminate drag lag.
- **Live WebSocket Highlight**: On incoming `finding:created` event over Socket.IO, apply flash highlight `bg-[#1e3a5f]` for `500ms` before fading to standard surface color.

---

## 8. Responsive Behavior

- Application target: Desktop developer workstation.
- Minimum supported viewport: `1280px` width.
- Below `1280px`: Outer container enables horizontal scroll (`overflow-x-auto`) to preserve editor and panel proportions without responsive degradation.

---

## 9. Accessibility

- **Color Contrast**: All text pairings verified against WCAG AA on dark surface backgrounds (minimum 4.5:1 ratio for normal text, 3:1 for large/graphical elements).
- **Keyboard Navigation**:
  - `Tab` / `Shift+Tab` cycles focusable elements in logical order.
  - Arrow keys navigate File Tree hierarchy and Findings list.
  - `Enter` / `Space` activates file selection and expands finding details.
- **Focus Rings**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0b]`.
- **Screen Reader Support**: `aria-label` applied to all icon-only buttons (copy suggestion, expand card, back button, toggle panel).

---

## 10. shadcn/ui Components to Install

Install the following components into `src/components/ui/`:
- `button`
- `badge`
- `card`
- `scroll-area`
- `separator`
- `skeleton`
- `tooltip`
- `collapsible`
- `tabs`
