# Classroom Studio

Classroom Studio is a local workspace for preparing exams, quizzes, worksheets, practice tests and custom assessments. It starts in **Demo mode**, with a deterministic template generator and source matching. Ollama mode uses a local language model and Qdrant retrieval.

## Run on Windows

Use Node.js 26 LTS and Corepack. Node.js 24.15 or later on the 24 LTS line also satisfies the workspace engines. If Corepack is missing, install it once with `npm.cmd install --global corepack@0.36.0`, then run `corepack.cmd enable` to expose the Yarn shim. PowerShell can use the `.cmd` shims without changing execution policy.

```powershell
yarn.cmd install --immutable
yarn.cmd build
yarn.cmd start
```

Open [Classroom Studio](http://127.0.0.1:4300). For Angular live reload, run `yarn.cmd dev` and open [the dev server](http://127.0.0.1:4200). Restart the dev command after changes to the API. On macOS and Linux, use `yarn` in place of `yarn.cmd`.

The workspace pins Nx 24.0.5, Angular 22.2.5 with Angular Build 22.2.6, NestJS 12.4.2, Tailwind 4.3.5, TypeScript 6.0.3 and Yarn 4.18.1. TypeScript 6.0 is the newest line supported by Angular 22. Angular Build supplies the Nx web executors, and Nx orchestrates the two applications and shared contracts. [Nx compatibility](https://nx.dev/docs/kb/angular-nx-version-matrix), [Angular compatibility](https://angular.dev/reference/versions), [Node LTS release](https://nodejs.org/en/blog/release/v26.13.0).

## Try an exam

1. Choose **Create document** and pick a type, or use **Try a sample exam** to load the bundled biology brief and two sources.
2. Enter a brief and optionally set the language, duration, question mix and total points under **More options**. The app interface is in English. Generated assessments and export labels support English and German.
3. Upload PDF, DOCX or UTF-8 TXT files, or paste notes. Select the sources to use and label each one by purpose. Expand **Preview extracted text** to inspect what Studio read. Scanned PDFs require OCR before upload.
4. Choose **How should AI use your materials?** Format samples guide structure in Ollama mode. Off uses the brief and selected notes. Basic searches selected content uploads for passages with similar meaning. Advanced combines that ranking with keyword retrieval and removes near duplicates. Graph also follows nearby passages and shared terms. Indexed content uploads default to Basic. Pasted notes are direct context.
5. Generate, then open **Editor**. Review warnings and supporting excerpts, edit prompts, points, answers and scoring, and reorder questions. For a replacement, choose **Regenerate question**, then preview and apply it. **Save version** creates an immutable snapshot. **Mark as ready** records a reviewed version.
6. Use **History** to preview, export or restore older versions. **Compare** shows stable-question changes and source settings side by side. **Generation audit** includes failures, timing, configured model, prompt version, parameters, usage when available and the actual excerpts used.
7. Use **Export** for student or teacher Word files and A4 print views. The print view has a **Print / save as PDF** button. Keep teacher-only information in the designated answer, scoring and private-note fields.

The synthetic [format sample](fixtures/sample-exam.txt) and [teaching materials](fixtures/teaching-notes.txt) are available for manual upload. Demo mode uses a small bilingual question bank for ecosystems and general templates for other topics. Its scoring guidance and source matching are illustrative.

## Enable Ollama

```powershell
Copy-Item .env.example .env
docker compose up -d qdrant
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

Set `STUDIO_PROVIDER=ollama` in `.env`, then run `yarn.cmd start`. Adjust `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL` and `QDRANT_URL` as needed. The bundled Qdrant service binds to `127.0.0.1:6335`. The API is bound to `127.0.0.1:4300`. Run one API process per data directory. Qdrant can be rebuilt from saved SQLite chunks when a document is retrieved. Use **Retry indexing** after fixing a failed embedding or Qdrant connection.

## Architecture

- `apps/web` contains the Angular workspace. The editor autosaves a mutable draft. Saved versions and job attempts live on the API.
- `apps/api` contains NestJS routes, SQLite persistence, the retrieval and generation adapters, assessment validation and student/teacher export projections. Ordered SQL migrations run at startup. `.studio` holds SQLite and original uploads by default.
- `libs/contracts` defines the shared schemas for settings, drafts, questions, citations and revision tokens.
- Generation queues one inference at a time. The document and idempotency key identify an attempt. SQLite records stage, timing and evidence. Startup requeues interrupted retrieval and records interrupted inference as failed. Successful generation commits the audit and AI version atomically. A revision check preserves a working draft saved while inference was running.
- SQLite stores authoritative source text. Qdrant stores vectors keyed by chunk ID. Retrieval filters by both document and explicitly selected source IDs and checks returned IDs against the SQLite corpus. Advanced uses BM25 and reciprocal rank fusion. Graph starts from hybrid anchors, visits up to 40 nodes at one or two hops, and records the path. The runtime source graph is distinct from the repository’s Graphify map.
- Uploads are capped at eight sources per document and 10 MB per file. File extraction runs in a bounded worker, with limits of 40 PDF pages and 64,000 extracted characters. Uploads enter the model prompt as reference data. Prompt bodies and source text stay out of application logs. Assessment validation checks point totals, fresh prompts, answer/scoring fields and citation references before saving.
- Exports are built from an explicit student or teacher projection. Student documents get instructions, question prompts, points and response space. Teacher copies include the answer key, scoring guidance, citations and review notes.

The approach adapts Product Intelligence Hub’s source selection, durable job records, evidence snapshots and review workflow. [Reference README](https://github.com/burakcitaci/product-intelligence/blob/13be710/README.md), [generation and retrieval](https://github.com/burakcitaci/product-intelligence/blob/13be710/docs/architecture/generation-and-rag.md), [generation jobs](https://github.com/burakcitaci/product-intelligence/blob/13be710/docs/architecture/generation-jobs.md).

## Verification

```powershell
yarn.cmd lint
yarn.cmd build
yarn.cmd test
yarn.cmd test:browser
yarn.cmd test:live
```

On Windows the browser suite uses installed Microsoft Edge. Linux CI installs Playwright Chromium. The browser suite uses an isolated SQLite database and the production Angular build. The optional live smoke requires Ollama and Qdrant to be running. It uses a temporary SQLite database and adds test vectors to the Classroom Studio collection.

## Repository graph

Open [the Graphify report](graphify-out/GRAPH_REPORT.md) or [the interactive map](graphify-out/graph.html). Use `graphify query "How does a generation become a version?"` from this directory to explore the graph. Use `graphify update .` after changing code.
