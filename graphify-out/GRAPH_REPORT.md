# Graph Report - classroom-studio  (2026-11-10)

## Corpus Check
- 38 files · ~21,109 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 1, .css 1)

## Summary
- 519 nodes · 1099 edges · 31 communities (21 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f6857bdf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Workspace Editor
- SQLite Jobs and Drafts
- Retrieval and Local Providers
- Integration Fixtures and Smoke Tests
- Nest HTTP Routes
- Documented Teacher Workflow
- Runtime Package Imports
- index.ts
- devDependencies
- app.ts
- API Bootstrap and Schema
- @typescript-eslint/parser
- API TypeScript Configuration
- Yarn Verification Workflow
- Angular Template Configuration
- Nx Target Defaults
- Workspace Package Settings
- Qdrant Compose Service
- Word and Print Exports
- Version Comparison
- Workspace Commands
- @playwright/test
- sources.ts
- Shared Compiler Defaults
- @angular-devkit/core@22.2.6
- @angular-devkit/schematics@22.2.6
- eslint@10.14.0
- postcss@^8.5.0
- tailwindcss@4.3.5
- @types/node@26.6.6
- @types/yauzl@3.4.0

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
- `SourceRow` --references--> `Source`  [EXTRACTED]
  apps/api/src/store.ts → libs/contracts/src/index.ts
- `JobRow` --references--> `Job`  [EXTRACTED]
  apps/api/src/store.ts → libs/contracts/src/index.ts
- `RevisionRow` --references--> `Revision`  [EXTRACTED]
  apps/api/src/store.ts → libs/contracts/src/index.ts
- `App` --references--> `Assessment`  [EXTRACTED]
  apps/web/src/app.ts → libs/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (31 total, 10 thin omitted)

### Community 0 - "Workspace Editor"
Cohesion: 0.07
Nodes (7): api(), App, DocumentSummary, Job, RagMode, Source, SourceRole

### Community 1 - "SQLite Jobs and Drafts"
Cohesion: 0.12
Nodes (15): JobService, SourceService, decode(), DocumentRow, encode(), JobRow, now(), RevisionRow (+7 more)

### Community 2 - "Retrieval and Local Providers"
Cohesion: 0.07
Nodes (41): comparable(), Context, DemoGenerator, ecosystem, Generator, localization, ModelOutput, modelQuestion (+33 more)

### Community 3 - "Integration Fixtures and Smoke Tests"
Cohesion: 0.09
Nodes (15): api, directory, client, port, server, client, start(), apiClient() (+7 more)

### Community 5 - "Documented Teacher Workflow"
Cohesion: 0.12
Nodes (19): Assessment editor, Document library, Generation audit, Retrieval mode controls, Source selection and roles, Side-by-side version comparison, Version history, Studio root entry point (+11 more)

### Community 6 - "Runtime Package Imports"
Cohesion: 0.08
Nodes (25): dependencies, @angular/common@22.2.5, @angular/compiler@22.2.5, @angular/forms@22.2.5, @angular/platform-browser@22.2.5, docx@9.15.3, express@^5.1.0, @nestjs/common@12.4.2 (+17 more)

### Community 7 - "index.ts"
Cohesion: 0.15
Nodes (10): assessmentSchema, briefSchema, evidenceSchema, isActive(), JobStage, questionBodySchema, questionSchema, selectionSchema (+2 more)

### Community 8 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, @angular/build@22.2.6, @angular/compiler-cli@22.2.5, @angular-devkit/build-angular@22.2.6, concurrently@10.0.7, nx@24.0.5, @nx/angular@24.0.5, @schematics/angular@22.2.6 (+15 more)

### Community 9 - "app.ts"
Cohesion: 0.12
Nodes (16): ApiError, Copy, Section, Tab, tabs, Icon, IconName, icons (+8 more)

### Community 10 - "API Bootstrap and Schema"
Cohesion: 0.12
Nodes (14): bootstrap(), commitSchema, config, copySchema, editSchema, enqueueSchema, jobs, noteSchema (+6 more)

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
Cohesion: 0.14
Nodes (13): pdf-parse@2.4.5, reflect-metadata@0.2.2, saxes@6.0.0, engines, node, name, packageManager, private (+5 more)

### Community 17 - "Qdrant Compose Service"
Cohesion: 0.20
Nodes (9): QDRANT__TELEMETRY_DISABLED, environment, image, ports, volumes, services, qdrant, volumes (+1 more)

### Community 18 - "Word and Print Exports"
Cohesion: 0.36
Nodes (8): Copy, escape(), exportDocx(), exportPrint(), paragraph(), presentation(), text(), totalPoints()

### Community 19 - "Version Comparison"
Cohesion: 0.47
Nodes (5): compare(), fields, locate(), Located, orderAmongShared()

### Community 20 - "Workspace Commands"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, test, test:browser, test:live

### Community 22 - "sources.ts"
Cohesion: 0.17
Nodes (15): extractText(), MAX_CHUNKS, MAX_SOURCES, MAX_TEXT, MAX_UPLOAD, normalize(), readEntry(), readZip() (+7 more)

### Community 23 - "Shared Compiler Defaults"
Cohesion: 0.29
Nodes (6): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, skipLibCheck, strict, target

## Knowledge Gaps
- **4 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Source selection and roles`, `Shared assessment contracts`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 148 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App` connect `Workspace Editor` to `SQLite Jobs and Drafts`, `Retrieval and Local Providers`, `Runtime Package Imports`, `index.ts`, `app.ts`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Source selection and roles` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Workspace Editor` be split into smaller, more focused modules?**
  _Cohesion score 0.06804214223002635 - nodes in this community are weakly interconnected._
- **Why does `StudioController` connect `Nest HTTP Routes` to `API Bootstrap and Schema`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `SQLite Jobs and Drafts` be split into smaller, more focused modules?**
  _Cohesion score 0.11623376623376623 - nodes in this community are weakly interconnected._
- **Why does `Store` connect `SQLite Jobs and Drafts` to `Retrieval and Local Providers`, `API Bootstrap and Schema`, `sources.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `Retrieval and Local Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.06554019457245264 - nodes in this community are weakly interconnected._