CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  updated TEXT NOT NULL,
  edit INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL,
  draft TEXT
) STRICT;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'note')),
  file_ext TEXT,
  status TEXT NOT NULL CHECK (status IN ('extracting', 'indexing', 'ready', 'error')),
  preview TEXT NOT NULL DEFAULT '',
  error TEXT,
  retryable INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX sources_document ON sources(doc_id);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(source_id, ordinal)
) STRICT;

CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id),
  number INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('AI', 'Teacher', 'Ready', 'Restored')),
  created TEXT NOT NULL,
  draft TEXT NOT NULL,
  settings TEXT NOT NULL,
  job_id TEXT,
  UNIQUE(doc_id, number)
) STRICT;

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id),
  request_key TEXT NOT NULL,
  input TEXT NOT NULL,
  base_edit INTEGER NOT NULL,
  created TEXT NOT NULL,
  started TEXT,
  stage TEXT NOT NULL,
  audit TEXT NOT NULL,
  UNIQUE(doc_id, request_key)
) STRICT;
CREATE INDEX jobs_document ON jobs(doc_id, created DESC);
CREATE INDEX jobs_stage ON jobs(stage, created);
