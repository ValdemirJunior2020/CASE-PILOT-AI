# CasePilot AI

**Free, local-first case investigations with evidence-linked findings and human review.**

![Status](https://img.shields.io/badge/runtime-local%20only-3cae83) ![License](https://img.shields.io/badge/license-MIT-blue)

CasePilot converts synthetic or explicitly authorized customer-service records into cited timelines, policy-grounded findings, coaching recommendations, and downloadable reports. This repository is an **independent** project and is not affiliated with HotelPlanner.

## Windows installation

1. Install [Node.js 22+](https://nodejs.org/). Node.js 24+ is recommended for more mature built-in SQLite support.
2. Download or clone this repository, preserving its structure.
3. Double-click **`INSTALL.bat`** (one-time npm dependency download and offline core tests), then **`START.bat`**.
4. Open **http://127.0.0.1:4317**. This binds to loopback only; no cloud credentials, accounts, or credit cards.
5. Click **Load synthetic demos**; open a case, select **Deterministic rules only** (works without any model), click **Run investigation**, inspect the citations, review the finding, and export JSON/PDF.

For local generative AI, install [Ollama](https://ollama.com/), execute `ollama pull qwen2.5:7b`, and start Ollama. Then choose **Ollama only**. Ollama and Qwen2.5 7B model files are downloaded once for local use. The model card lists Apache-2.0 for the chosen 7B Instruct weights; verify the specific installed quantization and distribution license independently. An alternative verified local model can be entered in the UI. **No automatic cloud fallback.**

## Automatic QA Autopilot (local-only)

The sidebar includes **QA Autopilot**, a read-only automatic review queue. When the Node backend starts, it watches `C:\\Users\\nobody\\Downloads\\QA-SYSTEM\\NOVO\\novo-novo\\data\\calls` every 30 seconds, waits for stable completed files, preserves the imported evidence, and asks the installed Ollama model for conservative nine-category QA proposals. No Upload or Analyze click is needed. Override the source path with `QA_CALLS_OUTPUT` and the model with `CASEPILOT_MODEL`.

**Important: your company Matrix and QA calibration files are confidential and are intentionally not stored in this public GitHub repository.** Before CasePilot can score calls, the private local folder `local-qa/policies/` must contain UTF-8 files named `master_prompt.txt`, `voice_matrix.txt`, and `qa_rubric.txt`. Optional dated updates belong in `process_updates.txt`. The dashboard shows which files are missing. If they are unavailable, calls display `AWAITING_POLICIES` and no score is invented. Restart or wait for the next 30-second scan after adding them. The ZIP patch prepared earlier includes converted text versions of the three provided policy sources and can be used as an offline source, without uploading private documents to GitHub.

This version **does not automatically write to Daily-Findings or Scores**. Ollama outputs are draft recommendations requiring evidence verification; the app does not make booking changes. No paid AI service or OpenAI API key is used. GitHub CI tests the build but does not prove a successful Windows/Ollama production integration.

## Available now

- React/TypeScript frontend with dashboard, intake, timeline, policy library, analytics, AI operations, reviews and exports.
- Fastify backend, SQLite (Node built-in), SHA256 evidence manifest, line-grounded evidence extraction (TXT/JSON/CSV), optional `pdftotext` and Python-backed DOCX extraction.
- WAV/MP3/PDF/image upload with explicit extraction-status signaling; missing extraction is not misrepresented as analysis. For images, add a clearly attributed manual description as a separate evidence note.
- Local Ollama JSON inference with deterministic fallback; provider identity is recorded in the job history.
- Citation ID verification, conservative downgrade of unsupported confirmed violations, immutable human review events, explicit refusal of re-analysis that would erase reviewed history.
- Three synthetic examples with expected outcomes; real SSE processing events (no fake progress bar); JSON and PDF exports.
- Seven passing offline core tests on Node 22 with built-in SQLite.

## CLI for development

```
npm install
npm test
npm run dev:api
npm run dev:ui
```

Dev UI: http://127.0.0.1:5173 (Vite proxies `/api` to local port 4317). Production build: `npm run build`; `npm start` serves built UI on 4317.

## Honest limitations

| Capability | Status |
| --- | --- |
| Synthetic document-to-finding-to-review workflow | Implemented; core tests passed |
| SQLite data persistence and real streamed events | Implemented; live server integration not executed in this build environment |
| React build and Windows `.bat` installation | Implemented but **not environment-tested**: npm registry was inaccessible during build |
| Ollama model inference | Implemented; not executed without a running local model |
| PDF/DOCX extraction | Requires optional external local tools; not yet end-to-end tested |
| Audio transcription and vision extraction | **Not yet implemented** (upload only) |
| Meta Model API | **Not implemented**; excluded to keep project free/local by default |
| Authenticated multi-user deployment | Not implemented; local single-user only |
| Semantic source-to-claim entailment verification | Partial: structural citations verified, not proof of semantic truth |
| Upload deletion / retention UI and policy comparison | Not implemented |
| Dependency lockfile / full license audit | Not complete: package installation unavailable to resolve dependencies |

The deterministic fallback is **not an AI run** and is shown as local rules. Findings are analytical suggestions, never automatically applied to bookings, guests or agents. Do not upload personal/employee/guest records to a public repository or demo.

## Offline privacy

App binds to `127.0.0.1`. All files stay under `data/` (ignored by Git). No third-party analytics, SaaS databases, remote inference, or paid APIs. Backend accepts only requests from local browser origins (browser Origin check); do not expose the server on a LAN or internet without authentication. Uploaded files are limited to 8 MiB; avoid using sensitive real cases until access control, retention, security review and proper data governance are added. The app does **not** refund, book, cancel, message, or contact external operational systems.

## Hackathon demo path

1. Import synthetic refund case → run deterministic or local Ollama analysis → see grounded timeline.
2. Open citations → verify policy `REFUND-02` and original booking-audit line.
3. Record reviewer decision → export PDF / JSON.
4. Demonstrate ambiguous date change (no false certainty) and compliant resolution (no invented violation).
5. Show real process log and local model health. Claim only actually tested features.

## Architecture

`web/src/` React UI → Fastify `/api` → `api/core.mjs` deterministic extraction, SQLite and analysis pipeline → local Ollama when selected → human review events → JSON/PDF reports.

See [LICENSES.md](LICENSES.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details. This software is MIT-licensed; external dependencies and local models have their own licenses.
