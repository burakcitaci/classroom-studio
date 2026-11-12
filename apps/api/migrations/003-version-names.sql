ALTER TABLE revisions ADD COLUMN name TEXT NOT NULL DEFAULT '' CHECK (char_length(name) <= 120);
ALTER TABLE revisions ADD COLUMN name_edit INTEGER NOT NULL DEFAULT 0 CHECK (name_edit >= 0);
