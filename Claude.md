# Laminar Intake Review Demo — Complete Build Plan

> **Assignment**: Zeenovo Health Practical — Laminar Intake Review Demo
> **Time Budget**: 2–3 hours to build | 10-minute walkthrough
> **Stack Decision**: Next.js 14 (App Router) + SQLite (via better-sqlite3) — single repo, single `npm run dev`

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Project Structure](#2-project-structure)
3. [Data Models & Database Schema](#3-data-models--database-schema)
4. [State Machine](#4-state-machine)
5. [API Contracts](#5-api-contracts)
6. [Mock Agent Logic](#6-mock-agent-logic)
7. [UI Layout — Single Screen](#7-ui-layout--single-screen)
8. [Idempotency & Timeout Recovery Design](#8-idempotency--timeout-recovery-design)
9. [Three Scenarios — Step-by-Step Flows](#9-three-scenarios--step-by-step-flows)
10. [Implementation Order (Phased)](#10-implementation-order-phased)
11. [Walkthrough Script (10 min)](#11-walkthrough-script-10-min)
12. [Shortcuts & Production Considerations](#12-shortcuts--production-considerations)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Next.js)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Intake Panel │  │  Review & Approve │  │  Laminar Profile  │  │
│  │  (TextArea +  │  │  (Side-by-side    │  │  (Patient view,   │  │
│  │   Extract)    │  │   edit + approve) │  │   entries list)   │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬──────────┘  │
│         │                   │                      │             │
└─────────┼───────────────────┼──────────────────────┼─────────────┘
          │                   │                      │
          ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NEXT.JS API ROUTES (Node.js)                  │
│                                                                 │
│  POST /api/extract          — mock agent extraction             │
│  POST /api/drafts           — save/update a draft               │
│  GET  /api/drafts/:id       — get a single draft                │
│  POST /api/drafts/:id/approve — validate + approve + submit     │
│  POST /api/pms/submit       — simulated PMS write (idempotent)  │
│  GET  /api/pms/status/:sid  — PMS status lookup                 │
│  POST /api/drafts/:id/verify— verify PMS status & update draft  │
│  GET  /api/laminar/:patRef  — Laminar profile for patient       │
│                                                                 │
│  ┌────────────────┐    ┌──────────────────────┐                 │
│  │  SQLite DB      │    │  Simulated PMS Store │                 │
│  │  (drafts table) │    │  (pms_entries table) │                 │
│  └────────────────┘    └──────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**

- **Single-screen UI** with 3 panels/sections (Intake → Review → Laminar Profile)
- **SQLite** via `better-sqlite3` for zero-config local persistence (synchronous, fast, no server needed)
- **Next.js App Router API routes** — no separate backend server
- **Mock agent** = simple regex/string parsing function (no LLM needed)
- **Simulated PMS** = separate SQLite table with idempotent upsert
- **Laminar Profile** = read-only view that queries drafts by patient reference

---

## 2. Project Structure

```
laminar-intake-review/
├── README.md
├── package.json
├── next.config.js
├── tsconfig.json
├── .env.local                    # PMS_TIMEOUT_MS=0 (toggle for timeout scenario)
│
├── lib/
│   ├── db.ts                     # SQLite connection + schema init
│   ├── mock-agent.ts             # Note → structured data extraction
│   ├── pms-client.ts             # Simulated PMS submit + status check
│   ├── validation.ts             # Shared validation (patientRef + requestType required)
│   └── types.ts                  # TypeScript interfaces
│
├── app/
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main single-screen page
│   ├── globals.css               # Tailwind + custom styles
│   │
│   ├── api/
│   │   ├── extract/
│   │   │   └── route.ts          # POST: mock agent extraction
│   │   ├── drafts/
│   │   │   ├── route.ts          # POST: create draft
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET: fetch draft
│   │   │       ├── approve/
│   │   │       │   └── route.ts  # POST: validate + approve + PMS submit
│   │   │       └── verify/
│   │   │           └── route.ts  # POST: verify PMS status
│   │   ├── pms/
│   │   │   ├── submit/
│   │   │   │   └── route.ts      # POST: simulated PMS write
│   │   │   └── status/
│   │   │       └── [submissionId]/
│   │   │           └── route.ts  # GET: PMS status lookup
│   │   └── laminar/
│   │       └── [patientRef]/
│   │           └── route.ts      # GET: Laminar profile
│   │
│   └── components/
│       ├── IntakePanel.tsx        # Note input + Extract button + sample buttons
│       ├── ReviewPanel.tsx        # Side-by-side: original note | editable fields
│       ├── LaminarProfile.tsx     # Patient profile + entries list
│       ├── StatusBadge.tsx        # Draft / Awaiting Confirmation / Confirmed
│       └── SampleNoteButtons.tsx  # Quick-load sample notes
│
└── data/
    └── laminar.db                # Auto-created SQLite database
```

---

## 3. Data Models & Database Schema

### TypeScript Interfaces (`lib/types.ts`)

```typescript
// What the mock agent extracts
interface ExtractedData {
  patientRef: string | null;      // e.g., "DEMO-101"
  requestType: string | null;     // e.g., "callback"
  callbackPreference: string | null; // e.g., "after 3 p.m."
  rawNote: string;                // original note text
}

// Draft record in our system
interface Draft {
  id: string;                     // UUID
  submissionId: string;           // Stable idempotency key (UUID, assigned at creation)
  rawNote: string;                // Original intake note
  patientRef: string | null;
  requestType: string | null;
  callbackPreference: string | null;
  status: 'draft' | 'awaiting_confirmation' | 'confirmed';
  pmsReference: string | null;    // PMS confirmation reference (e.g., "PMS-20231201-001")
  createdAt: string;              // ISO timestamp
  updatedAt: string;              // ISO timestamp
}

// PMS entry (simulated pharmacy management system)
interface PmsEntry {
  submissionId: string;           // Primary key — the idempotency key
  patientRef: string;
  requestType: string;
  callbackPreference: string | null;
  pmsReference: string;           // Generated confirmation ref
  status: 'saved';
  createdAt: string;
}

// Validation result
interface ValidationResult {
  valid: boolean;
  errors: string[];               // e.g., ["Patient reference is required"]
}
```

### SQLite Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  submission_id TEXT UNIQUE NOT NULL,
  raw_note TEXT NOT NULL,
  patient_ref TEXT,
  request_type TEXT,
  callback_preference TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  pms_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pms_entries (
  submission_id TEXT PRIMARY KEY,
  patient_ref TEXT NOT NULL,
  request_type TEXT NOT NULL,
  callback_preference TEXT,
  pms_reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  created_at TEXT NOT NULL
);
```

---

## 4. State Machine

```
                ┌──────────────────────────────────────────────┐
                │                                              │
                ▼                                              │
  ┌──────────────────┐    Approve     ┌──────────────────────┐ │  Verify
  │      DRAFT       │ ──────────────►│ AWAITING_CONFIRMATION│─┘  (PMS lookup)
  │                  │   (validate    │                      │
  │  • editable      │    + PMS       │  • PMS may have      │
  │  • no PMS write  │    submit)     │    saved it          │
  │  • can delete    │               │  • client uncertain  │
  └──────────────────┘               └──────────┬───────────┘
                                                │
                                     PMS confirms│(verify endpoint
                                     the write   │ finds entry)
                                                │
                                                ▼
                                     ┌──────────────────────┐
                                     │     CONFIRMED        │
                                     │                      │
                                     │  • has pmsReference  │
                                     │  • shown in Laminar  │
                                     │  • immutable         │
                                     └──────────────────────┘
```

**Transitions:**
1. **Extract** → creates a `draft` record
2. **Edit** → updates fields on the `draft` (stays in `draft`)
3. **Approve & Submit** → validates → submits to PMS → moves to `awaiting_confirmation` → if PMS responds immediately → moves to `confirmed`
4. **Timeout scenario** → PMS saves but client times out → stays at `awaiting_confirmation`
5. **Verify** → queries PMS by `submissionId` → if found → updates to `confirmed` with `pmsReference`

---

## 5. API Contracts

### `POST /api/extract`

**Purpose:** Run mock agent on a raw note, return structured data.

```
Request:  { "note": "Patient DEMO-101 requests a callback. Best time is after 3 p.m." }
Response: {
  "patientRef": "DEMO-101",
  "requestType": "callback",
  "callbackPreference": "after 3 p.m.",
  "rawNote": "Patient DEMO-101 requests a callback..."
}
```

No DB write here — extraction is stateless.

---

### `POST /api/drafts`

**Purpose:** Save extracted data as a new draft.

```
Request:  {
  "rawNote": "...",
  "patientRef": "DEMO-101" | null,
  "requestType": "callback" | null,
  "callbackPreference": "after 3 p.m." | null
}
Response: {
  "id": "uuid-1",
  "submissionId": "uuid-sub-1",   // stable idempotency key
  "status": "draft",
  ...all fields
}
```

---

### `GET /api/drafts/[id]`

**Purpose:** Fetch current state of a draft.

```
Response: { ...Draft }
```

---

### `POST /api/drafts/[id]/approve`

**Purpose:** Validate fields → submit to PMS → update status.

```
Request:  {
  "patientRef": "DEMO-101",        // required (may have been edited)
  "requestType": "callback",       // required
  "callbackPreference": "after 3 p.m." | null
}

Response (success): {
  "draft": { ...updatedDraft, status: "confirmed", pmsReference: "PMS-..." },
  "pmsResult": { ...PmsEntry }
}

Response (validation error, 400): {
  "errors": ["Patient reference is required", "Request type is required"]
}

Response (PMS timeout, 202): {
  "draft": { ...updatedDraft, status: "awaiting_confirmation" },
  "message": "Submitted but PMS confirmation timed out. Use verify to check status."
}
```

**Server-side validation:** Check `patientRef` and `requestType` are non-empty strings before ANY PMS call.

---

### `POST /api/pms/submit`

**Purpose:** Simulated PMS write. Idempotent — uses `submissionId` as the key.

```
Request:  {
  "submissionId": "uuid-sub-1",
  "patientRef": "DEMO-101",
  "requestType": "callback",
  "callbackPreference": "after 3 p.m."
}

Response: {
  "submissionId": "uuid-sub-1",
  "pmsReference": "PMS-20231201-001",
  "status": "saved"
}
```

**Idempotency logic:**
- If `submissionId` already exists in `pms_entries` → return the existing entry (no duplicate)
- If new → insert and return
- **Timeout simulation:** When env var `SIMULATE_PMS_TIMEOUT=true` or a request header `X-Simulate-Timeout: true` is set, the PMS still saves the entry but the response is delayed past the client timeout (or we throw before returning to simulate the client never seeing the response)

---

### `GET /api/pms/status/[submissionId]`

**Purpose:** Look up whether the PMS has an entry for this submission ID.

```
Response (found):     { "found": true,  "entry": { ...PmsEntry } }
Response (not found): { "found": false }
```

---

### `POST /api/drafts/[id]/verify`

**Purpose:** Check PMS for the draft's submission, update draft if confirmed.

```
Response: {
  "draft": { ...updatedDraft },
  "pmsEntry": { ...PmsEntry } | null,
  "verified": true | false
}
```

If PMS has the entry → updates draft to `confirmed` with `pmsReference`.

---

### `GET /api/laminar/[patientRef]`

**Purpose:** Return all submissions for a patient (the "Laminar profile view").

```
Response: {
  "patientRef": "DEMO-101",
  "entries": [
    {
      "draftId": "uuid-1",
      "submissionId": "uuid-sub-1",
      "requestType": "callback",
      "callbackPreference": "after 3 p.m.",
      "status": "confirmed",           // or "awaiting_confirmation"
      "pmsReference": "PMS-20231201-001" | null,
      "updatedAt": "..."
    }
  ]
}
```

---

## 6. Mock Agent Logic

The mock agent is a **deterministic string parser** (no LLM). It lives in `lib/mock-agent.ts`.

```typescript
function extractFromNote(note: string): ExtractedData {
  return {
    patientRef:         extractPatientRef(note),    // regex: /Patient\s+([A-Z]+-\d+)/i
    requestType:        extractRequestType(note),   // keyword match: "callback", "refill", "transfer"
    callbackPreference: extractCallbackPref(note),  // regex: /(?:best time|preferred?|after|before)\s+(?:is\s+)?(.+?)(?:\.|$)/i
    rawNote:            note,
  };
}
```

### Sample Notes (pre-loaded as buttons)

| # | Note | Expected Extraction |
|---|------|-------------------|
| 1 | "Patient DEMO-101 requests a callback. Best time is after 3 p.m." | `patientRef: "DEMO-101"`, `requestType: "callback"`, `callbackPreference: "after 3 p.m."` |
| 2 | "Caller asks for a prescription refill for lisinopril. Prefers morning callback." | `patientRef: null` ⚠️, `requestType: "refill"`, `callbackPreference: "morning"` |

**Note 2 intentionally has no patient reference** — this triggers the missing-required-field scenario.

---

## 7. UI Layout — Single Screen

```
┌────────────────────────────────────────────────────────────────────────┐
│  🏥 Laminar Intake Review                                    [Reset]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────── LEFT COLUMN (60%) ──────────────────────────────────┐   │
│  │                                                                 │   │
│  │  📝 INTAKE NOTE                                                │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  [textarea: paste or type a pharmacy intake note]        │  │   │
│  │  │                                                           │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │  [Sample 1: Complete note]  [Sample 2: Missing patient ref]    │   │
│  │  [🔍 Extract Draft]                                            │   │
│  │                                                                 │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                 │   │
│  │  📋 REVIEW & APPROVE              Status: [Draft ●]           │   │
│  │  ┌─────────────────────┬──────────────────────────────────┐    │   │
│  │  │ Original Note       │ Extracted Fields                  │    │   │
│  │  │                     │                                   │    │   │
│  │  │ "Patient DEMO-101  │ Patient Ref: [DEMO-101    ]  ✅  │    │   │
│  │  │  requests a         │ Request Type: [callback   ]  ✅  │    │   │
│  │  │  callback. Best     │ Callback Pref: [after 3pm ]      │    │   │
│  │  │  time is after      │                                   │    │   │
│  │  │  3 p.m."            │ ⚠️ Missing: Patient reference    │    │   │
│  │  │                     │                                   │    │   │
│  │  └─────────────────────┴──────────────────────────────────┘    │   │
│  │                                                                 │   │
│  │  [ ] Simulate PMS timeout                                      │   │
│  │  [✅ Approve and Submit]        (disabled if validation fails) │   │
│  │  [🔄 Verify PMS Status]        (shown only when awaiting)     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────── RIGHT COLUMN (40%) ─────────────────────────────────┐   │
│  │                                                                 │   │
│  │  🏥 LAMINAR PROFILE — Patient DEMO-101                         │   │
│  │                                                                 │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  Submission: uuid-sub-1                                   │  │   │
│  │  │  Type: callback                                           │  │   │
│  │  │  Callback: after 3 p.m.                                   │  │   │
│  │  │  Status: ● Confirmed                                      │  │   │
│  │  │  PMS Ref: PMS-20231201-001                                │  │   │
│  │  │  Updated: 2023-12-01 14:35                                │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │                                                                 │   │
│  │  (Empty state: "No entries yet. Extract and approve a note.")  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key UI Behaviors:**

- **Extract Draft button** → calls `/api/extract` then `/api/drafts` → populates Review section
- **Editable fields** in the Review section → updates local state only (no auto-save)
- **Validation warnings** shown inline: red border + message for missing `patientRef` or `requestType`
- **Approve and Submit** button → disabled when required fields empty → calls `/api/drafts/:id/approve`
- **Simulate PMS timeout** checkbox → sends `X-Simulate-Timeout: true` header on approve
- **Verify PMS Status** button → appears only when `status === 'awaiting_confirmation'` → calls `/api/drafts/:id/verify`
- **Laminar Profile panel** → auto-refreshes after approve/verify → polls or manually refreshes
- **StatusBadge** shows colored dot: 🟡 Draft, 🟠 Awaiting Confirmation, 🟢 Confirmed

---

## 8. Idempotency & Timeout Recovery Design

This is the **critical design point** the interviewers will evaluate:

### The Problem
> PMS saves the entry, but the HTTP response never reaches the client (timeout, network blip).
> The client doesn't know if the write succeeded. A naive retry would create a duplicate entry.

### The Solution: Stable Submission ID (Idempotency Key)

```
1. When a draft is CREATED, it gets a stable `submissionId` (UUID).
2. This submissionId NEVER changes, even across edits.
3. When approving, the submissionId is sent to the PMS.
4. The PMS uses submissionId as a PRIMARY KEY (or UNIQUE constraint).
5. If the PMS already has an entry for that submissionId → it returns the existing entry (upsert/ignore).
6. Result: no matter how many times you retry, only ONE PMS entry exists.
```

### Timeout Simulation Flow

```
Client                           Server (approve route)              PMS (simulated)
  │                                    │                                    │
  │  POST /approve                     │                                    │
  │  X-Simulate-Timeout: true          │                                    │
  │ ──────────────────────────────────► │                                    │
  │                                    │  POST /pms/submit                  │
  │                                    │ ──────────────────────────────────► │
  │                                    │                                    │
  │                                    │          { saved, pmsRef }         │
  │                                    │ ◄────────────────────────────────── │
  │                                    │                                    │
  │                                    │  // PMS saved it! But we simulate  │
  │                                    │  // timeout: update draft to       │
  │                                    │  // "awaiting_confirmation" and    │
  │                                    │  // return 202 (not 200)           │
  │                                    │  // Do NOT return pmsReference     │
  │       202 Accepted                 │                                    │
  │       status: awaiting_confirmation│                                    │
  │ ◄──────────────────────────────────│                                    │
  │                                    │                                    │
  │  // User clicks "Verify"          │                                    │
  │  POST /drafts/:id/verify           │                                    │
  │ ──────────────────────────────────►│                                    │
  │                                    │  GET /pms/status/:submissionId     │
  │                                    │ ──────────────────────────────────►│
  │                                    │          { found: true, entry }    │
  │                                    │ ◄─────────────────────────────────│
  │                                    │                                    │
  │                                    │  // Update draft → confirmed      │
  │       200 OK                       │                                    │
  │       status: confirmed            │                                    │
  │       pmsReference: PMS-...        │                                    │
  │ ◄──────────────────────────────────│                                    │
```

### Implementation Detail

In `api/drafts/[id]/approve/route.ts`:

```typescript
// 1. Validate required fields (server-side)
// 2. Update draft fields in DB
// 3. Call internal PMS submit
// 4. PMS always saves (idempotent insert)
// 5. Check if timeout simulation is active:
//    - If YES: set draft status to 'awaiting_confirmation', return 202
//    - If NO:  set draft status to 'confirmed' + pmsReference, return 200
```

This design means the **PMS truly has the data** even in the timeout case — it's the client's knowledge that's uncertain, which is the realistic scenario.

---

## 9. Three Scenarios — Step-by-Step Flows

### Scenario 1: Successful Submission ✅

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | Click **"Sample 1: Complete note"** | Textarea fills with: "Patient DEMO-101 requests a callback. Best time is after 3 p.m." |
| 2 | Click **"Extract Draft"** | Mock agent extracts → draft created → Review section shows fields: `patientRef=DEMO-101`, `requestType=callback`, `callbackPref=after 3 p.m.` |
| 3 | Edit `callbackPreference` to "after 4 p.m." | Field updates locally |
| 4 | Click **"Approve and Submit"** | Server validates ✅ → PMS saves → draft status → `confirmed` → PMS reference shown |
| 5 | View **Laminar Profile** panel | Shows confirmed entry for DEMO-101 with PMS reference |

### Scenario 2: Missing Required Field ⚠️

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | Click **"Sample 2: Missing patient ref"** | Textarea fills with: "Caller asks for a prescription refill for lisinopril. Prefers morning callback." |
| 2 | Click **"Extract Draft"** | Mock agent extracts → `patientRef=null` ⚠️, `requestType=refill`, `callbackPref=morning` |
| 3 | Observe | Review section shows ⚠️ warning: "Patient reference is required". Field has red border. **Approve button is disabled.** |
| 4 | Try clicking **"Approve and Submit"** anyway (button disabled) | Nothing happens (UI prevents submission) |
| 5 | Type `DEMO-102` in the Patient Ref field | Warning clears, Approve button enables |
| 6 | Click **"Approve and Submit"** | Server validates ✅ (double-checks on API) → PMS saves → confirmed |
| 7 | View **Laminar Profile** | Shows confirmed entry for DEMO-102 |

### Scenario 3: PMS Timeout & Recovery 🔄

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | Load Sample 1, Extract Draft | Draft created with all fields |
| 2 | Check **"☐ Simulate PMS timeout"** checkbox | Timeout flag set |
| 3 | Click **"Approve and Submit"** | Server submits to PMS (PMS saves it!) → but simulates timeout → draft moves to `awaiting_confirmation` → UI shows 🟠 status |
| 4 | Observe | "Verify PMS Status" button appears. Status badge shows "Awaiting Confirmation" |
| 5 | Click **"Verify PMS Status"** | Server queries PMS by submissionId → finds the saved entry → updates draft to `confirmed` with pmsReference |
| 6 | Observe | Status → 🟢 Confirmed. PMS reference displayed. |
| 7 | Click **"Approve and Submit"** again (or imagine a retry) | PMS returns the SAME existing entry (idempotent). No duplicate created. |
| 8 | View **Laminar Profile** | Shows exactly ONE confirmed entry — proving no duplicate |

---

## 10. Implementation Order (Phased)

### Phase 1: Foundation (30 min)

```
□ 1.1  Initialize Next.js project with TypeScript + Tailwind CSS
       $ npx create-next-app@latest laminar-intake-review --typescript --tailwind --app --src-dir=false
□ 1.2  Install dependencies: better-sqlite3, uuid, @types/better-sqlite3, @types/uuid
□ 1.3  Create lib/db.ts — SQLite connection + schema initialization
□ 1.4  Create lib/types.ts — TypeScript interfaces
□ 1.5  Create lib/validation.ts — shared validation logic
□ 1.6  Create lib/mock-agent.ts — note extraction with regex
□ 1.7  Verify: write a quick test or console.log that extraction works
```

### Phase 2: API Routes (45 min)

```
□ 2.1  POST /api/extract — stateless extraction endpoint
□ 2.2  POST /api/drafts — create draft with submissionId
□ 2.3  GET  /api/drafts/[id] — fetch single draft
□ 2.4  POST /api/pms/submit — simulated PMS with idempotent insert
□ 2.5  GET  /api/pms/status/[submissionId] — PMS status lookup
□ 2.6  POST /api/drafts/[id]/approve — validate + PMS submit + timeout simulation
□ 2.7  POST /api/drafts/[id]/verify — check PMS + update draft
□ 2.8  GET  /api/laminar/[patientRef] — patient profile query
□ 2.9  Test all endpoints with curl or REST client
```

### Phase 3: UI Components (45 min)

```
□ 3.1  Create page.tsx — main layout with state management (useState/useReducer)
□ 3.2  Build IntakePanel — textarea, sample buttons, extract button
□ 3.3  Build ReviewPanel — side-by-side view, editable fields, validation warnings
□ 3.4  Build StatusBadge — colored status indicator
□ 3.5  Add Approve button with timeout checkbox
□ 3.6  Add Verify button (conditional on awaiting_confirmation)
□ 3.7  Build LaminarProfile — patient entries list with status
□ 3.8  Wire up all API calls with fetch + loading states
```

### Phase 4: Polish & Scenarios (30 min)

```
□ 4.1  Test Scenario 1 end-to-end: successful submission
□ 4.2  Test Scenario 2 end-to-end: missing field
□ 4.3  Test Scenario 3 end-to-end: timeout + verify
□ 4.4  Add error handling (try/catch, error toasts/banners)
□ 4.5  Add loading spinners on buttons during API calls
□ 4.6  Reset/clear functionality
□ 4.7  Write README.md with setup, run, and scenario instructions
□ 4.8  Final cleanup: remove console.logs, check types
```

---

## 11. Walkthrough Script (10 min)

### Opening (1 min)
> "This is a single-page prototype that handles pharmacy intake review — from raw note to confirmed PMS entry. I'll walk through three scenarios that demonstrate extraction, validation, idempotent submission, and timeout recovery."

### Architecture Overview (2 min)
> "The stack is Next.js with App Router API routes and SQLite. There's no external service — everything runs locally. The mock agent is a deterministic parser, the PMS is a simulated table with idempotent writes, and the Laminar profile is a read-only view of approved submissions."

Draw attention to:
- Separation of concerns: agent proposes, app validates, reviewer authorizes
- The submissionId assigned at draft creation (before any PMS interaction)

### Demo Scenario 1 — Happy Path (2 min)
Walk through live. Highlight:
- Agent extracted structured data from free text
- Reviewer can edit before approving
- Server validates AGAIN on approval (defense in depth)
- Laminar profile updates with confirmed entry

### Demo Scenario 2 — Missing Field (2 min)
Walk through live. Highlight:
- Agent honestly returns null for missing data
- UI shows what blocks approval (red warnings, disabled button)
- API would reject even if UI was bypassed (server validation)
- Once field is supplied, normal flow continues

### Demo Scenario 3 — Timeout Recovery (2 min)
Walk through live. This is the **star scenario**. Highlight:
- PMS truly saved the data (show pms_entries table or PMS status endpoint)
- Client doesn't know — shows "awaiting confirmation"
- Verify button queries PMS by stable submissionId → finds it → confirms
- Click approve again → PMS returns same entry, no duplicate
- Laminar shows exactly one entry

### Closing (1 min)
> **What I simplified:**
> - Mock agent uses regex instead of an LLM
> - SQLite instead of a production database
> - No authentication or multi-user support
> - Single patient workflow (not a queue)
> - Timeout is simulated via flag, not actual network conditions
>
> **What I'd build first for production:**
> - Replace mock agent with an LLM-based extraction with confidence scores
> - Add an audit log for every state transition
> - Background job to auto-verify stuck "awaiting_confirmation" entries
> - Proper retry with exponential backoff + circuit breaker for PMS calls
> - Role-based access control for the review/approve workflow
> - Webhook or polling to receive PMS confirmation asynchronously
> - Integration tests covering all state transitions

---

## 12. Shortcuts & Production Considerations

### Shortcuts Taken (Document in README)

| Shortcut | Production Alternative |
|----------|----------------------|
| Regex-based mock agent | LLM extraction with confidence scores + human review threshold |
| SQLite file | PostgreSQL with proper migrations |
| In-process PMS simulation | External PMS API with circuit breaker |
| Client-side timeout simulation via checkbox | Actual network timeout handling with retry queue |
| No auth | OAuth2 / JWT with role-based access |
| No audit trail | Immutable event log for every state change |
| Manual "Verify" button | Background worker polling for unconfirmed entries |
| Single-screen SPA | Multi-page app with intake queue, review queue, patient search |

### Key Design Principles Demonstrated

1. **Agent proposes, human disposes** — The mock agent suggests extracted fields, but the reviewer has full edit authority before approval.

2. **Defense in depth** — Validation happens both in the UI (for UX) AND on the API (for correctness). The API never trusts the client.

3. **Idempotent writes** — The stable `submissionId` ensures at-most-once semantics in the PMS, regardless of retries.

4. **Explicit state transitions** — No implicit PMS writes. The reviewer must explicitly click "Approve and Submit."

5. **Observable uncertainty** — When the system doesn't know if the PMS write succeeded, it honestly shows "Awaiting Confirmation" rather than guessing. The user has a clear path to resolution (Verify).

---

## Quick Reference — Commands

```bash
# Setup
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false
npm install better-sqlite3 uuid
npm install -D @types/better-sqlite3 @types/uuid

# Run
npm run dev
# → http://localhost:3000

# Reset database
rm data/laminar.db && npm run dev
```
