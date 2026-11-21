# Classroom Studio

Classroom Studio is a local workspace for preparing exams, quizzes, worksheets, practice tests and custom assessments. It starts in **Demo mode**, with a deterministic template generator and source matching. Ollama mode uses a local language model and Qdrant retrieval.

## Run on Windows

Use Node.js 26 LTS and Corepack. Node.js 24.15 or later on the 24 LTS line also satisfies the workspace engines. If Corepack is missing, install it once with `npm.cmd install --global corepack@0.36.0`, then run `corepack.cmd enable` to expose the Yarn shim. PowerShell can use the `.cmd` shims without changing execution policy.

```powershell
docker compose up -d --wait postgres qdrant
yarn.cmd install --immutable
yarn.cmd build
yarn.cmd start
```

Open [Classroom Studio](http://127.0.0.1:4300). For Angular live reload, run `yarn.cmd dev` and open [the dev server](http://127.0.0.1:4200). Restart the dev command after changes to the API. On macOS and Linux, use `yarn` in place of `yarn.cmd`.

The API runs in the foreground and exits if its launching process disappears, including when a Windows terminal or runner is forcibly closed. This prevents an orphaned API from keeping port 4300 occupied on the next start. An `EADDRINUSE` startup error means another process still owns the configured port; stop that instance before starting another one.

The workspace pins Nx and @nx/angular 24.0.5, Angular 22.2.5 with Angular Build 22.2.6, NestJS 12.4.2, Tailwind 4.3.5, TypeScript 6.0.3 and Yarn 4.18.1. TypeScript 6.0 is the newest line supported by Angular 22. Nx runs the Angular build and dev server through @nx/angular, and builds the NestJS API with tsc. The @nx/nest 24.0.5 generator supports NestJS 10 and 11. The API uses NestJS 12 directly. [Nx compatibility](https://nx.dev/docs/kb/angular-nx-version-matrix), [Angular compatibility](https://angular.dev/reference/versions), [Node LTS release](https://nodejs.org/en/blog/release/v26.13.0).

## PostgreSQL

Docker Compose runs PostgreSQL 18 at 127.0.0.1:5433 and stores the database in the classroom_database Docker volume. Configure the API connection with DATABASE_URL in .env. The defaults in .env.example match the local Compose service.

PostgreSQL is the source of truth for classes, lessons, documents, source text, revisions and generation jobs. The API applies ordered SQL migrations from apps/api/migrations at startup. Original uploaded files are stored in .studio/uploads; Qdrant holds a rebuildable search index derived from PostgreSQL.

Start PostgreSQL before running the API or test suites. Tests create and remove their own PostgreSQL schemas. Docker Compose shutdown preserves the database volume.

## Back up or move a workspace

Build Studio, then run the backup command with the API stopped and PostgreSQL running. It writes a portable directory with a manifest and original uploads. Choose a directory that does not exist yet.

```powershell
yarn.cmd backup create ./classroom-backup
yarn.cmd backup inspect ./classroom-backup
yarn.cmd backup restore ./classroom-backup classroom_restored ./.studio-restored
```

Inspect verifies the original uploads and shows the record counts before import. Restore requires a new PostgreSQL schema and a new data directory, and checks that the build uses the backup's migrations. Set `STUDIO_DATABASE_SCHEMA=classroom_restored` and `STUDIO_DATA=./.studio-restored` in .env to open the restored workspace. Ollama retrieval rebuilds missing Qdrant vectors from the restored chunks.

## Interface language

Choose **English** or **Deutsch** in the top bar. Studio starts with your browser language and remembers your choice on this browser. Switching languages saves the current document and reloads the same page. Close an open planning form or add pasted notes before switching. New unfiled documents and classes default to the current interface language; changing the interface never changes an existing document's output language or teacher-written content.

The interface uses Angular's native `i18n` attributes and `$localize` messages, with `loadTranslations` called before application modules load. Both languages run from the same production build and the same development server. Dates and numbers follow the selected locale. Language preference is stored in the browser; classroom and document records remain in PostgreSQL.

Run `yarn.cmd i18n:extract` to regenerate `apps/web/src/locale/messages.extracted.json`. Update the English and German simple JSON catalogs in that directory when adding messages. `yarn.cmd i18n:check` extracts again and verifies that both catalogs contain every message and preserve interpolation placeholders. CI runs the same check. [Angular internationalization](https://angular.dev/guide/i18n), [runtime translations](https://angular.dev/api/localize/loadTranslations).

## Plan a class

Classes is the start page. Create a class with its subject, grade, description, school year, and default document language. Add dated or unscheduled lessons with learning goals. Open a lesson and choose **Create document** to reuse its topic and goals in the assessment brief.

The **Documents** library shows work across classes and includes an Unfiled filter. Open a document and choose **Organize** to move it to a class or lesson. Class and lesson pages link back to their documents. Document details show a breadcrumb back to Documents, the class and the lesson on desktop and mobile. Following it saves pending document edits. Archive completed classes and reopen them from the Archived filter.

## Try an exam

1. Choose **Create document** and pick a type, or use **Try a sample exam** to load the bundled biology brief and two sources.
2. In **Plan**, choose **Edit plan**, enter a brief and optionally set the language, duration, question mix and total points under **More options**. Choose **Save plan** to persist the changes, **Save plan and generate** to start drafting, or **Cancel** to restore the previous plan. New empty plans start in edit mode. Save or cancel plan edits before generating or leaving the view. The interface, generated assessments and export labels support English and German. Choose the interface language in the top bar; the document output language is a separate setting.
3. Upload PDF, DOCX or UTF-8 TXT files, or paste notes. Select the sources to use and label each one by purpose. Expand **Preview extracted text** to inspect what Studio read. Scanned PDFs require OCR before upload. Archive an unused source to free a slot while preserving its historical excerpts. In a filed document, **Save to class materials** makes a ready source reusable in other documents in the same class.
4. Choose **How should AI use your materials?** Format samples guide structure in Ollama mode. Off uses the brief and selected notes. Basic searches selected content uploads for passages with similar meaning. Advanced combines that ranking with keyword retrieval and removes near duplicates. Graph also follows nearby passages and shared terms. Indexed content uploads default to Basic. Pasted notes are direct context.
5. Generate, then open **Editor**. Review warnings and supporting excerpts, edit prompts, points, answers and scoring, and reorder questions. For a replacement, choose **Regenerate question**, then preview and apply it. **Save version** creates an immutable snapshot. **Preview**, immediately before **Mark as ready**, saves edits and opens the student print view without creating a version. **Mark as ready** records a reviewed version.
6. Use **History** to preview, export, duplicate or restore older versions. Restore checkpoints the outgoing draft and offers Undo. Use **Duplicate document** to make an editable copy in another class or lesson. **Compare** shows stable-question changes and source settings side by side. **Generation audit** includes failures, timing, configured model, prompt version, parameters, usage when available and the actual excerpts used.
7. With Ollama and retrieval enabled, a past exam selected as content supplies extracted facts with source quotes. The drafting model receives those facts and format hints, and the completed draft is checked for copied questions. Find **Organize** and **Export** in the document header. The export dialog identifies the working draft or saved version and highlights the default audience. Use **Export** for student or teacher Word files and A4 print views. The print view has a **Print / save as PDF** button. Keep teacher-only information in the designated answer, scoring and private-note fields.

The synthetic [format sample](fixtures/sample-exam.txt) and [teaching materials](fixtures/teaching-notes.txt) are available for manual upload. Demo mode uses a small bilingual question bank for ecosystems and general templates for other topics. Its scoring guidance and source matching are illustrative.

## Enable Ollama

If Ollama is already running, Classroom Studio connects to it at http://127.0.0.1:11434. Run the pull commands only for models missing from ollama list.

```powershell
Copy-Item .env.example .env
docker compose up -d --wait postgres qdrant
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

Set `STUDIO_PROVIDER=ollama` in `.env`, then run `yarn.cmd start`. Open an assessment and choose its **Ollama model** before generating. The selection is saved with the document, and each generation attempt records the model it used. Adjust `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL` and `QDRANT_URL` as needed. The bundled Qdrant service binds to `127.0.0.1:6335`. The API is bound to `127.0.0.1:4300`. Run one API process for the configured database. Qdrant can be rebuilt from saved PostgreSQL chunks when a document is retrieved. Use **Retry indexing** after fixing a failed embedding or Qdrant connection.

## Review generated drafts

With two distinct local Ollama text models installed, open **Plan** and select **Local source review** under **Draft review**. The drafting model writes the assessment and the second model checks it against retrieved excerpts. If material is missing, the audit records that the source check was skipped.

For an optional Gemini second opinion, set `GEMINI_API_KEY` and `GEMINI_MODEL` to a Gemini model ID that supports structured output in the API server’s environment, then restart Studio. Choose **Local review and Gemini second opinion** and confirm the data disclosure for that run. The API sends Google a projection of the plan and draft. Original files, retrieved excerpts and private notes stay local. Use synthetic materials while evaluating the feature. See the [Gemini API terms](https://ai.google.dev/gemini-api/terms) before offering cloud review to teachers.

Findings can trigger one revision by the drafting model. Studio validates the result and keeps the original valid draft if revision fails. **Generation audit** records each reviewer, its findings and duration, and whether a revision was saved. To compare reviewers, try the same brief with standard generation, local review, and the Gemini second opinion.

## Architecture

- `apps/web/src/app/features` groups the standalone Angular screens for documents, assessments, sources, generation and versions. Templates sit beside their components. Shared styles and feature layouts are grouped in `apps/web/src/styles.css`. The interface uses Spartan UI’s Angular button and dialog primitives with local styling. Spartan Sonner displays success, error and generation progress toasts. Save-conflict toasts retain actions to keep edits or load the latest draft. The workspace store coordinates autosave and background progress, and `app/core/studio-api.ts` handles HTTP.
- `apps/api/src` contains NestJS feature modules for classes and lessons, documents, sources, generation and exports. Controllers handle HTTP and delegate to services and persistence. Nest injects the Ollama or demo provider and the vector index. Ordered SQL migrations run at startup. `.studio` holds original uploads. PostgreSQL holds classes, lessons, documents, revisions, jobs and source text. The connection pool uses a single connection per transaction.
- `libs/contracts` defines the shared schemas for settings, drafts, questions, citations and revision tokens.
- Generation queues one inference at a time. The document and idempotency key identify an attempt. PostgreSQL records stage, timing and evidence. Startup requeues interrupted retrieval and records interrupted inference as failed. Successful generation commits the audit and AI version atomically. A revision check preserves a working draft saved while inference was running.
- PostgreSQL stores authoritative source text. Qdrant stores vectors keyed by chunk ID. Retrieval filters by both document and explicitly selected source IDs and checks returned IDs against the PostgreSQL corpus. Advanced uses BM25 and reciprocal rank fusion. Graph starts from hybrid anchors, visits up to 40 nodes at one or two hops, and records the path. The runtime source graph is distinct from the repository’s Graphify map.
- Uploads are capped at eight sources per document and 10 MB per file. File extraction runs in a bounded child process, with limits of 40 PDF pages and 64,000 extracted characters. Uploads enter the model prompt as reference data. Prompt bodies and source text stay out of application logs. Assessment validation checks point totals, fresh prompts, answer/scoring fields and citation references before saving.
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

On Windows the browser suite uses installed Microsoft Edge. Linux CI installs Playwright Chromium. The browser suite uses an isolated PostgreSQL schema and the production Angular build. The optional live smoke requires Ollama and Qdrant to be running. It uses a temporary PostgreSQL schema and adds test vectors to the Classroom Studio collection.

## Repository graph

Open [the Graphify report](graphify-out/GRAPH_REPORT.md) or [the interactive map](graphify-out/graph.html). Use `graphify query "How does a generation become a version?"` from this directory to explore the graph. Use `graphify update .` after changing code.

### Reusable document types

Use **Manage document types** in Documents or Brief & Sources to save a name, reusable guidance and an output audience. For example, start with **Erwartungshorizont**, keep the instructions about model answers and marking criteria, then enter only the topic and special requirements in each document's Plan. Save the Plan before generating.

Types are stored in PostgreSQL. Selecting a type saves its guidance with the document; editing or archiving the reusable type does not change existing documents. Teacher types use the selected reference tasks to produce solutions and marking criteria, and Preview opens the teacher copy. Student types continue to require fresh questions. Ollama combines the saved guidance with the brief and selected sources; Demo mode produces sample content.
