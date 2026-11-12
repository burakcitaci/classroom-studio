# Graph Report - classroom-studio  (2026-11-12)

## Corpus Check
- 106 files · ~52,562 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 1, .css 1)

## Summary
- 951 nodes · 2261 edges · 42 communities (31 shown, 11 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d95f7dd2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PostgreSQL Persistence
- generation.service.ts
- classrooms-page.ts
- Workspace State and Autosave
- package.json Configuration
- api.test.mjs
- Documented Teacher Workflow
- api/src/main.ts
- document-workspace.ts
- ClassroomsService
- dependencies Configuration
- @nestjs/common
- Assessment Configuration
- retrieval.ts
- extract-text.ts
- compiler Options
- verify Configuration
- DocumentFiling
- web/tsconfig.json Configuration
- nx.json Configuration
- @playwright/test
- document-types.service.ts
- ClassroomsPage
- postgres
- exports.controller.ts
- app.ts
- index.ts
- scripts Configuration
- compiler Options
- workspace-store.ts
- documents-page.ts
- providers.module.ts
- app.module.ts
- AssessmentEditor
- .enqueue
- SourcesController
- StudioController
- Notifications
- DocumentsPage
- exports.module.ts
- sources.service.ts
- engines

## God Nodes (most connected - your core abstractions)
1. `WorkspaceStore` - 82 edges
2. `StudioStore` - 40 edges
3. `ui()` - 26 edges
4. `@nestjs/common` - 25 edges
5. `check()` - 24 edges
6. `@angular/core` - 24 edges
7. `ClassroomsService` - 19 edges
8. `ClassroomsPage` - 19 edges
9. `Job` - 19 edges
10. `now()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `LessonRow` --inherits--> `LessonInput`  [EXTRACTED]
  apps/api/src/classrooms/classrooms.service.ts → libs/contracts/src/classrooms.ts
- `presentation()` --calls--> `totalPoints()`  [EXTRACTED]
  apps/api/src/exports/assessment-export.ts → libs/contracts/src/index.ts
- `GenerationContext` --references--> `Question`  [EXTRACTED]
  apps/api/src/generation/assessment/assessment-schema.ts → libs/contracts/src/index.ts
- `Input` --references--> `Question`  [EXTRACTED]
  apps/api/src/generation/generation.service.ts → libs/contracts/src/index.ts
- `SourceRow` --references--> `Source`  [EXTRACTED]
  apps/api/src/persistence/studio-store.ts → libs/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (42 total, 11 thin omitted)

### Community 0 - "PostgreSQL Persistence"
Cohesion: 0.07
Nodes (22): validateAssessment(), factPassages(), isExamReference(), briefLimits(), GenerationService, ContextRow, contextView(), decode() (+14 more)

### Community 1 - "generation.service.ts"
Cohesion: 0.08
Nodes (41): atlasPlaceholder(), draftIssue(), FactPassage, GenerationContext, Generator, ModelOutput, ModelQuestion, outputSchema (+33 more)

### Community 2 - "classrooms-page.ts"
Cohesion: 0.15
Nodes (16): ClassroomRow, LessonRow, ClassroomsApi, emptyClass, emptyLesson, example, Form, Classroom (+8 more)

### Community 3 - "Workspace State and Autosave"
Cohesion: 0.09
Nodes (4): WorkspaceStore, Tab, Source, SourceRole

### Community 4 - "package.json Configuration"
Cohesion: 0.06
Nodes (46): devDependencies, @angular/build@22.2.6, @angular/compiler-cli@22.2.5, @angular-devkit/build-angular@22.2.6, @angular-devkit/core@22.2.6, @angular-devkit/schematics@22.2.6, concurrently@10.0.7, eslint@10.14.0 (+38 more)

### Community 5 - "api.test.mjs"
Cohesion: 0.07
Nodes (18): api, directory, client, port, server, client, start(), teardown() (+10 more)

### Community 6 - "Documented Teacher Workflow"
Cohesion: 0.09
Nodes (25): Workspace Shell, Assessment Brief, Retrieval Mode Selection, Assessment Editor, Question Regeneration Preview, Documents Page, Try a Sample Exam, Generation Audit (+17 more)

### Community 7 - "api/src/main.ts"
Cohesion: 0.24
Nodes (7): AppModule, localOnly(), bootstrap(), express@^5.1.0, @nestjs/platform-express@12.4.2, express, @nestjs/platform-express

### Community 8 - "document-workspace.ts"
Cohesion: 0.18
Nodes (11): Section, evidenceFor(), VersionHistory, workspaceTabs, formatTimestamp(), Icon, IconName, icons (+3 more)

### Community 9 - "ClassroomsService"
Cohesion: 0.08
Nodes (6): ClassroomsController, ClassroomsService, classroomView(), lessonView(), DocumentsController, DocumentContextInput

### Community 10 - "dependencies Configuration"
Cohesion: 0.06
Nodes (31): dependencies, @angular/cdk@22.2.6, @angular/common@22.2.5, @angular/compiler@22.2.5, @angular/core@22.2.5, @angular/forms@22.2.5, @angular/localize@22.2.5, @angular/platform-browser@22.2.5 (+23 more)

### Community 11 - "@nestjs/common"
Cohesion: 0.13
Nodes (20): archiveSchema, updateSchema, commitSchema, createSchema, fileSchema, restoreSchema, copySchema, formatSchema (+12 more)

### Community 12 - "Assessment Configuration"
Cohesion: 0.17
Nodes (10): labels, ui(), ClassDocuments, compare(), fields, locate(), Located, orderAmongShared() (+2 more)

### Community 13 - "retrieval.ts"
Cohesion: 0.12
Nodes (18): Chunk, countResponse, embeddingResponse, hitsResponse, QdrantIndex, closeText(), cosine(), DemoIndex (+10 more)

### Community 14 - "extract-text.ts"
Cohesion: 0.15
Nodes (16): extractText(), MAX_CHUNKS, MAX_SOURCES, MAX_TEXT, normalize(), readEntry(), readZip(), splitText() (+8 more)

### Community 15 - "compiler Options"
Cohesion: 0.15
Nodes (12): compilerOptions, emitDecoratorMetadata, experimentalDecorators, module, moduleResolution, noEmitOnError, outDir, rootDir (+4 more)

### Community 16 - "verify Configuration"
Cohesion: 0.09
Nodes (21): NX_DAEMON, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, jobs, verify, name, on (+13 more)

### Community 18 - "web/tsconfig.json Configuration"
Cohesion: 0.14
Nodes (13): angularCompilerOptions, strictInjectionParameters, strictTemplates, compilerOptions, allowSyntheticDefaultImports, lib, module, moduleResolution (+5 more)

### Community 19 - "nx.json Configuration"
Cohesion: 0.17
Nodes (11): analytics, cache, defaultBase, cache, neverConnectToCloud, $schema, targetDefaults, build (+3 more)

### Community 21 - "document-types.service.ts"
Cohesion: 0.13
Nodes (5): DocumentTypesController, DocumentTypesService, Row, view(), DocumentTypeInput

### Community 23 - "postgres"
Cohesion: 0.08
Nodes (24): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, QDRANT__TELEMETRY_DISABLED, interval, retries, test, timeout (+16 more)

### Community 24 - "exports.controller.ts"
Cohesion: 0.16
Nodes (11): Copy, escape(), exportDocx(), exportPrint(), lines(), paragraph(), presentation(), rule (+3 more)

### Community 25 - "app.ts"
Cohesion: 0.13
Nodes (8): App, initializeLocale(), interfaceLocale, rememberLocale(), requested, DocumentWorkspace, StudioToaster, @angular/common

### Community 26 - "index.ts"
Cohesion: 0.10
Nodes (17): SourceMaterials, documentTypeInputSchema, DocumentTypeSnapshot, documentTypeSnapshotSchema, briefSchema, evidenceSchema, initialSettings(), isActive() (+9 more)

### Community 27 - "scripts Configuration"
Cohesion: 0.20
Nodes (10): scripts, build, dev, i18n:check, i18n:extract, lint, start, test (+2 more)

### Community 28 - "compiler Options"
Cohesion: 0.29
Nodes (6): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, skipLibCheck, strict, target

### Community 29 - "workspace-store.ts"
Cohesion: 0.17
Nodes (8): ApiError, RequestOptions, StudioApi, AssessmentBrief, Copy, kinds, RagMode, @angular/core

### Community 30 - "documents-page.ts"
Cohesion: 0.17
Nodes (6): DocumentTypesManager, DocumentTypesStore, TeacherDialog, DocumentType, @angular/forms, @spartan-ng/brain

### Community 31 - "providers.module.ts"
Cohesion: 0.25
Nodes (6): StudioConfigModule, StudioConfig, PersistenceModule, GENERATOR, ProvidersModule, sampleSchema

### Community 32 - "app.module.ts"
Cohesion: 0.20
Nodes (5): ClassroomsModule, DocumentTypesModule, DocumentsModule, GenerationModule, SourcesModule

### Community 40 - "sources.service.ts"
Cohesion: 0.33
Nodes (5): VECTOR_INDEX, MAX_UPLOAD, extensions, Extracted, uuid

## Knowledge Gaps
- **12 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Question Regeneration Preview`, `Source Materials`, `Demo Mode` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 302 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WorkspaceStore` connect `Workspace State and Autosave` to `PostgreSQL Persistence`, `classrooms-page.ts`, `document-workspace.ts`, `Assessment Configuration`, `app.ts`, `index.ts`, `workspace-store.ts`, `documents-page.ts`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `Question Regeneration Preview` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PostgreSQL Persistence` be split into smaller, more focused modules?**
  _Cohesion score 0.06944444444444445 - nodes in this community are weakly interconnected._
- **Why does `@nestjs/common` connect `@nestjs/common` to `app.module.ts`, `PostgreSQL Persistence`, `classrooms-page.ts`, `package.json Configuration`, `exports.module.ts`, `sources.service.ts`, `dependencies Configuration`, `document-types.service.ts`, `providers.module.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `generation.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07656341320864991 - nodes in this community are weakly interconnected._
- **Why does `check()` connect `@nestjs/common` to `.enqueue`, `SourcesController`, `StudioController`, `ClassroomsService`, `document-types.service.ts`, `exports.controller.ts`, `providers.module.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `Workspace State and Autosave` be split into smaller, more focused modules?**
  _Cohesion score 0.0873015873015873 - nodes in this community are weakly interconnected._