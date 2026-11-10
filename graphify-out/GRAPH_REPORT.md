# Graph Report - classroom-studio  (2026-11-10)

## Corpus Check
- Corpus is ~20,946 words - fits in a single context window. You may not need a graph.

## Summary
- 509 nodes · 1082 edges · 32 communities (23 shown, 9 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Workspace Editor
- SQLite Jobs and Drafts
- Retrieval and Local Providers
- Integration Fixtures and Smoke Tests
- Nest HTTP Routes
- Documented Teacher Workflow
- Runtime Package Imports
- Upload Text Extraction
- Development Toolchain
- Shared Studio Types
- API Bootstrap and Schema
- Assessment Generation Validation
- API TypeScript Configuration
- Yarn Verification Workflow
- Angular Template Configuration
- Nx Target Defaults
- Workspace Package Settings
- Qdrant Compose Service
- Word and Print Exports
- Version Comparison
- Workspace Commands
- Questions and Evidence
- Angular Icons
- Shared Compiler Defaults
- Angular Compiler
- Word Library
- Nest Core
- Decorator Metadata
- Angular Compiler CLI
- Nx Runtime
- Express Types
- ZIP Types

## God Nodes (most connected - your core abstractions)
1. `App` - 72 edges
2. `Store` - 28 edges
3. `StudioController` - 18 edges
4. `Job` - 15 edges
5. `SourceService` - 12 edges
6. `Revision` - 12 edges
7. `QdrantIndex` - 11 edges
8. `retrieve()` - 11 edges
9. `decode()` - 11 edges
10. `Settings` - 11 edges

## Surprising Connections (you probably didn't know these)
- `exportPrint()` --calls--> `text()`  [EXTRACTED]
  apps/api/src/exports.ts → libs/contracts/src/index.ts
- `RevisionRow` --references--> `Revision`  [EXTRACTED]
  apps/api/src/store.ts → libs/contracts/src/index.ts
- `App` --references--> `Assessment`  [EXTRACTED]
  apps/web/src/app.ts → libs/contracts/src/index.ts
- `App` --references--> `Brief`  [EXTRACTED]
  apps/web/src/app.ts → libs/contracts/src/index.ts
- `App` --references--> `Job`  [EXTRACTED]
  apps/web/src/app.ts → libs/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (32 total, 9 thin omitted)

### Community 0 - "Workspace Editor"
Cohesion: 0.07
Nodes (6): SourceRow, api(), ApiError, App, DocumentSummary, Source

### Community 1 - "SQLite Jobs and Drafts"
Cohesion: 0.11
Nodes (15): Generator, JobService, SourceService, decode(), DocumentRow, encode(), JobRow, now() (+7 more)

### Community 2 - "Retrieval and Local Providers"
Cohesion: 0.10
Nodes (22): OllamaGenerator, countResponse, embeddingResponse, hitsResponse, localRequest(), ProviderError, QdrantIndex, closeText() (+14 more)

### Community 3 - "Integration Fixtures and Smoke Tests"
Cohesion: 0.09
Nodes (15): api, directory, client, port, server, client, start(), apiClient() (+7 more)

### Community 5 - "Documented Teacher Workflow"
Cohesion: 0.11
Nodes (19): Assessment editor, Document library, Generation audit, Retrieval mode controls, Source selection and roles, Side-by-side version comparison, Version history, Studio root entry point (+11 more)

### Community 6 - "Runtime Package Imports"
Cohesion: 0.09
Nodes (21): dependencies, @angular/common@22.2.5, @angular/forms@22.2.5, @angular/platform-browser@22.2.5, express@^5.1.0, @nestjs/common@12.4.2, @nestjs/platform-express@12.4.2, pdf-parse@2.4.5 (+13 more)

### Community 7 - "Upload Text Extraction"
Cohesion: 0.16
Nodes (16): extractText(), MAX_CHUNKS, MAX_SOURCES, MAX_TEXT, MAX_UPLOAD, normalize(), readEntry(), readZip() (+8 more)

### Community 8 - "Development Toolchain"
Cohesion: 0.10
Nodes (19): devDependencies, @angular/build@22.2.6, concurrently@10.0.7, eslint@10.14.0, @playwright/test@1.65.0, tailwindcss@4.3.5, @tailwindcss/postcss@4.3.5, @types/multer@2.3.0 (+11 more)

### Community 9 - "Shared Studio Types"
Cohesion: 0.14
Nodes (17): Copy, Section, Tab, tabs, Brief, briefSchema, evidenceSchema, isActive() (+9 more)

### Community 10 - "API Bootstrap and Schema"
Cohesion: 0.11
Nodes (16): bootstrap(), commitSchema, config, copySchema, editSchema, enqueueSchema, jobs, noteSchema (+8 more)

### Community 11 - "Assessment Generation Validation"
Cohesion: 0.12
Nodes (15): comparable(), DemoGenerator, ecosystem, localization, ModelOutput, modelQuestion, outputSchema, parameters (+7 more)

### Community 12 - "API TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, emitDecoratorMetadata, experimentalDecorators, module, moduleResolution, noEmitOnError, outDir, rootDir (+4 more)

### Community 13 - "Yarn Verification Workflow"
Cohesion: 0.15
Nodes (12): NX_DAEMON, jobs, verify, name, on, run, uses, with (+4 more)

### Community 14 - "Angular Template Configuration"
Cohesion: 0.17
Nodes (11): angularCompilerOptions, strictInjectionParameters, strictTemplates, compilerOptions, lib, module, moduleResolution, types (+3 more)

### Community 15 - "Nx Target Defaults"
Cohesion: 0.17
Nodes (11): analytics, cache, defaultBase, cache, neverConnectToCloud, $schema, targetDefaults, build (+3 more)

### Community 16 - "Workspace Package Settings"
Cohesion: 0.17
Nodes (11): postcss@^8.5.0, typescript@6.0.3, engines, node, name, packageManager, private, type (+3 more)

### Community 17 - "Qdrant Compose Service"
Cohesion: 0.20
Nodes (9): QDRANT__TELEMETRY_DISABLED, environment, image, ports, volumes, services, qdrant, volumes (+1 more)

### Community 18 - "Word and Print Exports"
Cohesion: 0.36
Nodes (8): Copy, escape(), exportDocx(), exportPrint(), paragraph(), presentation(), text(), totalPoints()

### Community 19 - "Version Comparison"
Cohesion: 0.33
Nodes (8): compare(), fields, locate(), Located, orderAmongShared(), Side, Assessment, Settings

### Community 20 - "Workspace Commands"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, test, test:browser, test:live

### Community 21 - "Questions and Evidence"
Cohesion: 0.38
Nodes (5): Context, Input, Evidence, Generation, Question

### Community 22 - "Angular Icons"
Cohesion: 0.29
Nodes (5): Icon, IconName, icons, @angular/core@22.2.5, @angular/core

### Community 23 - "Shared Compiler Defaults"
Cohesion: 0.29
Nodes (6): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, skipLibCheck, strict, target

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Shared assessment contracts`, `Product Intelligence Hub reference`, `Source selection and roles`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 149 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App` connect `Workspace Editor` to `SQLite Jobs and Drafts`, `Runtime Package Imports`, `Shared Studio Types`, `Version Comparison`, `Questions and Evidence`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Shared assessment contracts` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Workspace Editor` be split into smaller, more focused modules?**
  _Cohesion score 0.06603346901854365 - nodes in this community are weakly interconnected._
- **Why does `StudioController` connect `Nest HTTP Routes` to `API Bootstrap and Schema`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `SQLite Jobs and Drafts` be split into smaller, more focused modules?**
  _Cohesion score 0.11433756805807622 - nodes in this community are weakly interconnected._
- **Why does `Store` connect `SQLite Jobs and Drafts` to `API Bootstrap and Schema`, `Retrieval and Local Providers`, `Upload Text Extraction`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `Retrieval and Local Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.10121457489878542 - nodes in this community are weakly interconnected._
## Extraction coverage

Graphify processed TypeScript, JavaScript and configuration structurally. A Codex agent extracted concepts from the README, HTML templates and sample materials. Token usage was unavailable for the agent step and recorded as zero.

The integrity diagnostic flagged 7 unresolved endpoints, 1 self-loop and 15 shared-endpoint edges in the undirected projection. The optional SQL parser was absent, so the migration is outside structural coverage.
