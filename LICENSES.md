# Local/Open-Source License Register

**CasePilot AI source:** MIT (see LICENSE).

| Component | Role | Reported license | Reference |
|---|---|---|---|
| Node.js | JavaScript runtime; built-in SQLite | MIT / component notices | https://github.com/nodejs/node |
| React / React DOM | UI | MIT | https://github.com/facebook/react |
| Vite | Development/build | MIT | https://github.com/vitejs/vite |
| TypeScript | Type checking | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Fastify | HTTP service | MIT | https://github.com/fastify/fastify |
| @fastify/static | Built asset serving | MIT | https://github.com/fastify/fastify-static |
| Lucide React | Icons | ISC | https://github.com/lucide-icons/lucide |
| PDFKit | PDF reports | MIT | https://github.com/foliojs/pdfkit |
| @vitejs/plugin-react | React build | MIT | https://github.com/vitejs/vite-plugin-react |
| Ollama | Optional local LLM runtime | MIT | https://github.com/ollama/ollama |
| Qwen2.5-7B-Instruct | Suggested local model weights | Apache-2.0 (upstream checkpoint) | https://huggingface.co/Qwen/Qwen2.5-7B-Instruct |
| Poppler `pdftotext` | Optional document extraction | GPL-family; build/distribution specific | https://poppler.freedesktop.org/ |
| Python | Optional DOCX extraction | PSF | https://www.python.org/psf/license/ |

**Pre-shipping task:** run a complete dependency and transitive license audit after `npm install` is accessible (`npm ls --all`, license scanner, model/quantization source provenance). The listing above is a reference register, **not a completed supply-chain audit**. Optional Poppler has strong copyleft terms that must be reviewed before bundling or redistribution; it is not bundled in this repository. Model distributions must be individually verified before redistribution.

No paid or hosted APIs are required. Meta's model API is **not** integrated; Meta model weights must not be called open source without reviewing their actual license.
