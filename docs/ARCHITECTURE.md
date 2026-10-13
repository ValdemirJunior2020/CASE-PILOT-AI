# Architecture and Trust Boundaries

The local Windows desktop browser talks to Fastify on 127.0.0.1:4317. The server owns all file writes and SQLite (WAL mode). Files are stored under `data/evidence/<case UUID>/<source UUID>.<allowed-extension>`; the original filename is metadata only. Browser upload max: 8 MiB. Text gets line-indexed citations; unsupported modalities are retained with an explicit extraction status, never fabricated spans.

**Stages:** case creation → evidence storage + SHA256 → local extraction → cited source observations → chronological timeline (unknown times explicitly labeled) → Ollama structured JSON proposals or labeled deterministic fallback → schema/ID checks and conservative violation downgrade → human review (append-only review event) → exports.

**Policy:** versions have title, version, effective date, and section IDs/text. The latest effective policy is selected. The verifier checks that every cited span and policy ID exists. Structural verification is **not** full semantic entailment. A production-grade verifier must add claim decomposition, contradiction and entailment scoring, and human evidence-trace sign-off before stronger accuracy claims.

**Ollama:** local loopback only, explicit local model. On `auto`, an Ollama error triggers labeled deterministic rules; in `ollama` mode errors remain failures. Prompt-injected documents are treated as data, but adversarial red-team testing remains necessary.

**Security:** bind to loopback; no cloud API; no auth yet; no customer-service actions; no guest PII in logs; Git ignores `data/`; reject unsupported extensions and basic file signatures. A hardened release additionally needs MIME magic for all supported types, file malware scanning, resource quotas, durable job queue/cancellation, authorization, retention and automatic deletion, thorough provenance validation, line/page alignment for all parsers, and scoped role-based reviews.

**Evaluation:** run `npm test` for SQLite, hashing, demo verdicts, fabricated citation downgrade, conservative confirmed-violation classification, immutable review and basic invalid input. These are core tests only: a full frontend and Fastify integration suite plus Windows smoke testing are still open.
