# Laminar Intake Review Demo

A full-stack clinical prototype that converts synthetic pharmacy intake notes into staff-reviewed drafts, executes idempotent submissions to a simulated Pharmacy Management System (PMS), and maintains a parallel patient profile in Laminar.

Built for the **Zeenovo Health Practical Assignment** (2–3 hours build, 10-minute walkthrough).

---

## Architecture & System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Next.js 14)                            │
│                                                                        │
│   ┌──────────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│   │ 1. Intake Note       │  │ 2. Review Panel  │  │ 3. Laminar      │  │
│   │    • Raw text area   │  │    • Side-by-side│  │    Patient      │  │
│   │    • Sample presets  │  │    • Field edits │  │    Profile      │  │
│   │    • Extract action  │  │    • Validation  │  │    • Submissions│  │
│   │                      │  │    • Timeout sim │  │    • PMS status │  │
│   └──────────┬───────────┘  └────────┬─────────┘  └────────┬────────┘  │
│              │                       │                     │           │
└──────────────┼───────────────────────┼─────────────────────┼───────────┘
               │                       │                     │
               ▼                       ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS APP ROUTER API                            │
│                                                                        │
│   POST /api/extract             Deterministic Mock Extraction Agent    │
│   POST /api/drafts              Create draft with stable submissionId  │
│   GET  /api/drafts/[id]         Fetch draft state                      │
│   POST /api/drafts/[id]/approve Defense-in-depth validation + PMS call │
│   POST /api/pms/submit          Simulated PMS write (Idempotent)       │
│   GET  /api/pms/status/[subId]  Simulated PMS status lookup            │
│   POST /api/drafts/[id]/verify  Reconcile uncertain writes             │
│   GET  /api/laminar/[patRef]    Parallel Laminar Patient Profile       │
│                                                                        │
│       ┌────────────────────────────────────────────────────────┐       │
│       │               SQLite Persistence (WAL mode)            │       │
│       │       • drafts table                                   │       │
│       │       • pms_entries table (PK: submission_id)          │       │
│       └────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart & Setup Commands

### Prerequisites
- **Node.js**: v18.17.0+ or v20.x+
- **npm**: v9+ or v10+

### Installation & Run

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Clear all stored patient and PMS records (clean slate for demos)
npm run db:clear
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional: Connect Live Gemini 1.5 Flash AI
The application features a **dual-mode extraction agent**:
- **Default (Zero Setup / Offline)**: Uses the built-in deterministic mock agent. Works offline with zero keys.
- **Live Gemini AI (Gemini 1.5 Flash)**: In `.env.local`, set:
  ```bash
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
  When present, the system extracts intake drafts using **Google Gemini 1.5 Flash** via `@google/generative-ai` with structured JSON output, and displays a purple `✨ Gemini 1.5 Flash` badge in the Review panel! If the key is omitted or the network drops, it automatically falls back to the local mock agent.


### Test Suites

The project includes unit, integration, and full E2E test suites with zero external test runner overhead:

```bash
# Run unit tests (extraction regex, validation rules, DB operations)
npm run test:unit

# Run integration tests (all 8 Next.js API route handlers)
npm run test:integration

# Run combined unit + integration tests (64 tests)
npm test

# Run full E2E automated test suite (spawns test server, tests Tiers 1-4, 66 tests)
npm run test:e2e

# Run production build validation
npm run build
```

---

## Sample Inputs Provided

Two pre-configured sample inputs are directly clickable in the UI:

1. **Sample 1 (Complete Intake Note):**
   > `"Patient DEMO-101 requests a callback. Best time is after 3 p.m."`
   - *Extraction output*: `patientRef: "DEMO-101"`, `requestType: "callback"`, `callbackPreference: "after 3 p.m."`
   - Demonstrates complete extraction and ready-to-approve path.

2. **Sample 2 (Incomplete Intake Note - Missing Patient Reference):**
   > `"Caller asks for a prescription refill for lisinopril. Prefers morning callback."`
   - *Extraction output*: `patientRef: null`, `requestType: "refill"`, `callbackPreference: "morning callback"`
   - Demonstrates missing required field detection and reviewer intervention.

---

## Step-by-Step Scenario Verification

### Scenario 1: Successful Submission (Happy Path with Field Edit)
1. In the **Intake Note** section, click **"Sample 1: Complete note"**.
2. Click **"Extract Draft"**.
   - The mock agent extracts the fields.
   - The **Review & Approve** panel shows the original text on the left and extracted fields on the right.
   - Both `Patient Reference` and `Request Type` show green checkmarks.
3. Edit the `Callback Preference` field to `"after 4:30 p.m."`.
4. Click **"Approve and Submit"**.
5. Observe the result:
   - Status badge transitions from `Draft` to `Confirmed` (green badge).
   - A generated PMS reference (e.g., `PMS-20231201-001`) appears.
   - The **Laminar Profile** panel on the right updates to show the confirmed clinical entry under patient `DEMO-101`.

### Scenario 2: Missing Required Field (Validation Defense-in-Depth)
1. Click **"Reset Demo"** (or clear input), then click **"Sample 2: Missing patient ref"**.
2. Click **"Extract Draft"**.
3. Observe:
   - Patient Reference is empty and highlighted with a red border.
   - Inline warning displays: `⚠️ Missing: Patient reference is required`.
   - The **"Approve and Submit"** button is **disabled**.
4. Try typing only spaces into the Patient Reference field: the button remains disabled (whitespace validation).
5. Type a valid patient identifier: `DEMO-102`.
   - The warning vanishes and the green checkmark appears.
   - The "Approve and Submit" button is enabled.
6. Click **"Approve and Submit"**.
   - The server validates the payload, saves to PMS, and transitions the state to `Confirmed`.
   - The Laminar profile on the right immediately reflects patient `DEMO-102`.

### Scenario 3: Saved in PMS, Response Timed Out (Uncertain Write & Recovery)
1. Load **Sample 1** and click **"Extract Draft"**.
2. Check the **"Simulate PMS response timeout"** checkbox.
3. Click **"Approve and Submit"**.
4. Observe the simulated failure:
   - The PMS successfully commits the record into its database (`pms_entries`), but simulates a network disconnect/client timeout before acknowledging.
   - The UI displays an amber status badge: `Awaiting Confirmation`.
   - The Laminar profile reflects `Pending verification...`.
   - A blue **"Verify PMS Status"** button appears in the review panel.
5. Click **"Verify PMS Status"**:
   - The application queries the PMS using the draft's stable `submissionId`.
   - The PMS acknowledges that the record exists.
   - The draft updates to `Confirmed`, displaying the confirmed PMS Reference.
   - The Laminar profile confirms the entry.
6. **Demonstrating Idempotency on Repeat/Retry:**
   - Even if the reviewer clicks "Approve and Submit" again or retries multiple times, the system reuses the same stable `submissionId`.
   - The simulated PMS recognizes the existing `submissionId` as its primary key and returns the existing record without creating duplicate entries.
   - Check the Laminar profile: **exactly one** record exists for this submission.

---

## 10-Minute Walkthrough Guide

Use this outline during your walkthrough interview:

### 1. System & State Architecture (2 min)
- **UI States**:
  - `Draft`: Initial extracted state; editable; no writes dispatched to PMS.
  - `Awaiting Confirmation`: Write sent to PMS, awaiting positive acknowledgment or recovery.
  - `Confirmed`: PMS acknowledged with an immutable reference; displayed in Laminar profile.
- **API Contracts**:
  - `POST /api/extract`: Pure, stateless extraction.
  - `POST /api/drafts`: Initializes a draft with a stable UUID `submissionId`.
  - `POST /api/drafts/[id]/approve`: Enforces server-side validation; writes to PMS. Supports `X-Simulate-Timeout` header.
  - `POST /api/pms/submit`: Simulates the PMS repository with `submission_id` as primary key for idempotency.
  - `POST /api/drafts/[id]/verify`: Reconciles unconfirmed drafts against PMS storage.
  - `GET /api/laminar/[patientRef]`: Read-only clinical profile view.
- **Storage Layer**: SQLite (`data/laminar.db`) with separate `drafts` and `pms_entries` tables connected via `submission_id`.

### 2. Responsibility Separation (2 min)
- **What the Agent Proposes**: Free-form text parsing into candidate fields (`patientRef`, `requestType`, `callbackPreference`). The agent is advisory only.
- **What Application Code Verifies**:
  - Required fields presence (`patientRef`, `requestType`).
  - Rejection of null, empty, whitespace-only, and malformed inputs.
  - Double validation: UI prevents invalid clicks; API independently rejects invalid payloads (HTTP 400).
- **What the Reviewer Authorizes**: Explicit human-in-the-loop sign-off. No PMS writes occur until the reviewer explicitly clicks "Approve and Submit".

### 3. Recovering from Uncertain Writes (3 min)
- Explain the **distributed systems problem**: network timeouts mean the client cannot distinguish between "PMS failed before saving" and "PMS saved, but response was dropped".
- Explain the **solution**:
  1. Draft creation assigns a stable, immutable `submissionId` (idempotency key).
  2. Submissions to PMS pass this key as the primary record identifier.
  3. If a response is lost, the client marks state as `Awaiting Confirmation`.
  4. The reviewer or background reconciliation process calls `/api/drafts/[id]/verify`.
  5. Retrying the submission is completely safe—the PMS returns the existing record without duplicates.

### 4. Shortcuts Taken & Production Pilot Roadmap (3 min)

| Prototype Shortcut | Production Pilot Requirement |
|--------------------|-----------------------------|
| **Mock Regex Agent** | LLM extraction (e.g. Gemini 1.5 Pro) with confidence scores, clinical entity recognition, and highlight-to-source citations. |
| **Local SQLite File** | Managed PostgreSQL / CockroachDB with read replicas and row-level encryption. |
| **In-Process Simulated PMS** | External HL7 / FHIR or proprietary PMS integration with circuit breakers and mutual TLS (mTLS). |
| **Manual Verify Button** | Automated asynchronous background reconciliation worker (polling or webhook callbacks) with Dead Letter Queue (DLQ). |
| **Single-Page Demo** | Multi-tenant clinical intake queue with role-based access control (RBAC), triage priorities, and audit logging. |
| **In-Memory State Synchronization** | WebSocket / SSE real-time state sync across multiple concurrent pharmacy staff reviewers. |

---

## Project Structure

```
laminar-intake-review/
├── app/
│   ├── api/
│   │   ├── drafts/
│   │   │   ├── [id]/
│   │   │   │   ├── approve/route.ts  # Validation + PMS dispatch
│   │   │   │   ├── verify/route.ts   # PMS reconciliation
│   │   │   │   └── route.ts          # Get single draft
│   │   │   └── route.ts              # Create draft
│   │   ├── extract/route.ts          # Mock extraction agent
│   │   ├── laminar/[patientRef]/     # Parallel patient profile
│   │   └── pms/
│   │       ├── status/[submissionId]/# PMS lookup
│   │       └── submit/route.ts       # Idempotent PMS write
│   ├── components/
│   │   ├── IntakePanel.tsx           # Text intake & sample presets
│   │   ├── ReviewPanel.tsx           # Side-by-side review & actions
│   │   ├── LaminarProfile.tsx        # Patient profile view
│   │   ├── SampleNoteButtons.tsx     # Sample note presets
│   │   └── StatusBadge.tsx           # Status indicators
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Single-screen dashboard
├── lib/
│   ├── db.ts                         # SQLite client & schema
│   ├── mock-agent.ts                 # Regex extraction logic
│   ├── pms-client.ts                 # PMS caller abstraction
│   ├── types.ts                      # Shared TypeScript models
│   └── validation.ts                 # Reusable validation rules
├── scripts/
│   └── test-e2e.ts                   # Automated E2E test runner
├── tests/
│   ├── unit/                         # Unit tests (mock agent, DB, validation)
│   ├── integration/                  # API integration tests
│   └── e2e/                          # 4-tier E2E test suite (66 tests)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Submission Checklist

- [x] **Goal met**: Prototype turns synthetic note into staff-reviewed draft, submits to PMS, and shows in Laminar profile.
- [x] **Capture and extract**: Text box, "Extract draft" action, local mock agent, Sample 1 & Sample 2 presets.
- [x] **Review and approve**: Side-by-side view, editable draft, required field enforcement in UI & API, explicit approve action.
- [x] **Send to simulated PMS**: Local API with stable `submissionId` reuse, Draft / Awaiting confirmation / Confirmed states.
- [x] **Verify and update Laminar**: Parallel patient profile showing awaiting confirmation and confirmed states with PMS reference.
- [x] **All 3 scenarios covered**: Successful submission, Missing required field, and PMS timeout recovery with idempotency proof.
- [x] **Comprehensive test coverage**: 23 unit tests + 41 integration tests + 66 E2E tests passing.
- [x] **Production build passing**: `npm run build` compiles with 0 errors.
