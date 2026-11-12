CREATE TABLE document_types (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  guidance TEXT NOT NULL CHECK (char_length(guidance) BETWEEN 1 AND 2500),
  audience TEXT NOT NULL CHECK (audience IN ('student', 'teacher')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  edit INTEGER NOT NULL DEFAULT 0 CHECK (edit >= 0),
  updated TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX document_types_active_title ON document_types (lower(title)) WHERE archived = 0;
