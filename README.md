# Laminar Intake Review

A clinical pharmacy intake and review platform that transforms unstructured phone notes and prescription photos into validated clinical drafts, executes idempotent submissions to a simulated Pharmacy Management System (PMS), and maintains a live patient timeline in Laminar.

Built for the **Zeenovo Health Practical Assignment**.

---

## Project Overview

In busy clinical pharmacy environments, intake requests arrive as hurried receptionist notes, voicemail transcripts, or photos of prescriptions. Automating this intake requires more than just raw AI extraction—it demands strict safety boundaries, human-in-the-loop verification, and idempotent system integration:

1. **Intake Note & Prescription Ingestion (Component 1)**
   - Accepts raw clinical notes or prescription photos.
   - Built-in live camera capture modal (webcam viewfinder with flip camera support), file upload, and clickable sample presets.
   - Enforces single-source clarity: attaching a prescription photo locks manual text entry to prevent accidental multi-patient data collisions.

2. **Multimodal Clinical Extraction with Caching & Safeguards**
   - **Dual-Mode AI Engine**: Uses Google Gemini multimodal vision/text models with structured JSON output, paired with a deterministic local fallback that works completely offline.
   - **Handwriting OCR**: Deciphers cursive handwriting, clinical shorthand, medication dosages, and patient names.
   - **Irrelevant Photo Detection**: Strictly detects non-medical images (e.g. photos of a ceiling, faces, blank surfaces) and marks fields as null instead of hallucinating medical requests.
   - **Multi-Tier Token Caching**: L1 in-memory and L2 SQLite cache layers eliminate repeated AI token burn on identical notes and photos (0ms latency, 0 tokens).

3. **Side-by-Side Human Review & Approval (Component 2)**
   - Displays the original intake note or click-to-enlarge prescription document alongside editable extracted fields (`Patient Reference`, `Request Type`, and `Callback Preference`).
   - **Defense-in-Depth Validation**: UI and API independently enforce mandatory clinical fields, blocking submission on missing or whitespace-only inputs.
   - **Full State Persistence**: Application state is safely preserved across browser reloads (`F5`) without input disappearance or premature cache overwrites.

4. **PMS Integration & Idempotency**
   - Every draft is assigned an immutable, client-stable `submissionId` (UUID).
   - Submissions to the simulated PMS use this key as a unique constraint. Network timeouts, page refreshes, and repeated submissions never result in duplicate records.
   - Supports simulated network timeouts (`Awaiting Confirmation` state) with a manual/automated reconciliation flow (`Verify PMS Status`).

5. **Parallel Laminar Patient Profile (Component 3)**
   - Renders a real-time clinical submission history for the active patient.
   - Interactive timeline cards: clicking any historical draft instantly loads it into the Review panel for inspection or status verification.

---

## Quickstart & Setup

### Prerequisites
- **Node.js**: v18.17.0+ or v20.x+
- **npm**: v9+ or v10+

### Installation & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Clear stored database records (optional - for a clean slate demo)
npm run db:clear
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional: Live Gemini AI Setup
The application works 100% out-of-the-box offline using the built-in deterministic extractor. To enable live Gemini AI extraction:
1. Create a `.env.local` file in the root directory:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
2. Restart the dev server (`npm run dev`). The Review panel will display a `✨ Gemini` indicator during live AI extractions.

---

## How to Test This App

### 1. Automated Test Suites

The project includes unit and integration test suites:

```bash
# Run unit tests (validation rules, database idempotency, extraction logic)
npm run test:unit

# Run integration tests (Next.js API routes, timeout simulation, PMS verification)
npm run test:integration

# Run all automated tests together (65 passing tests)
npm test

# Verify production build compilation
npm run build
```

---

### 2. Manual Testing Scenarios (Browser Walkthrough)

Open [http://localhost:3000](http://localhost:3000) and follow these scenarios:

#### Scenario A: Happy Path with Complete Note
1. In **1. Intake Note & Prescription Photo**, click the preset button **"Sample 1: Complete note"**.
2. Click **"Extract Draft"**.
3. In **2. Review & Approve**, observe:
   - Verbatim text appears on the left.
   - Extracted fields appear on the right (`DEMO-101`, `callback`, `after 3 p.m.`) with green checkmarks.
4. Edit the **Callback Preference** field (e.g., change to `"after 5 p.m."`).
5. Click **"Approve and Submit"**.
6. Verify:
   - Status badge turns green (`Confirmed`).
   - Generated PMS Reference (e.g. `PMS-20261126-001`) appears.
   - **3. Patient Profile** on the right reflects patient `DEMO-101` with the confirmed entry.

#### Scenario B: Validation Defense-in-Depth (Missing Patient Ref)
1. Click **"Reset Demo"** in the top navigation bar.
2. Click the preset **"Sample 2: Missing patient ref"**, then click **"Extract Draft"**.
3. In **2. Review & Approve**, observe:
   - Patient Reference input has a red highlight with: `⚠️ Missing: Patient reference is required`.
   - The **"Approve and Submit"** button is **disabled**.
4. Try typing spaces into Patient Reference: the button remains disabled (whitespace rejection).
5. Type `PATIENT-999` into Patient Reference. The red alert disappears and the submit button enables.
6. Click **"Approve and Submit"** to confirm the record into PMS.

#### Scenario C: Prescription Photo & Camera Ingestion (Multimodal Vision)
1. Click the preset **"Sample 3: Prescription Photo"** (or use **"Take Photo (Camera)"** / **"Upload Photo"**).
2. Notice the textarea automatically disables to prevent conflicting multi-patient text entry.
3. Click **"Extract Draft"**.
4. In **2. Review & Approve**, observe:
   - The prescription image preview appears with a **"Click to enlarge"** modal.
   - Patient Reference (`Rohit Verma`), Request Type (`refill`), and Callback Preference are extracted.
5. In **3. Patient Profile**, the patient's existing history is loaded automatically.

#### Scenario D: Browser Reload & State Persistence
1. With any draft loaded in **2. Review & Approve**, press **F5** or reload the browser.
2. Verify that:
   - The active submission ID, prescription image, and note text remain loaded.
   - All input fields (`Patient Reference`, `Request Type`, `Callback Preference`) remain populated.
   - The patient timeline on the right remains displayed.
   - No inputs or draft states disappear on reload.

#### Scenario E: Network Timeout Recovery & Idempotency Proof
1. Extract a draft (e.g. Sample 1).
2. Check the **"Simulate PMS timeout"** checkbox below the review form.
3. Click **"Approve and Submit"**.
4. Observe:
   - The PMS successfully commits the record in its database, but simulates a client timeout before acknowledgment.
   - Status transitions to amber: `Awaiting Confirmation`.
   - A blue **"Verify PMS Status"** button appears.
5. Click **"Verify PMS Status"**:
   - The application queries PMS using the draft's stable `submissionId`.
   - The record transitions to `Confirmed` with its PMS reference.
6. **Idempotency Check**: Even with repeated verification clicks or repeated submissions, check the Patient Profile on the right: exactly **one** record exists for this submission ID, proving zero duplicate writes.

#### Scenario F: Historical Card Selection & Reset
1. In **3. Patient Profile**, click on any previous submission card in the timeline list.
2. The selected submission immediately loads into **2. Review & Approve** with its full data.
3. Click **"Reset Demo"** in the top right header to clean all inputs, clear `localStorage`, and reset the demo workspace.
