ALTER TABLE sources ADD COLUMN original_id UUID REFERENCES sources(id);
ALTER TABLE sources ADD COLUMN material_id UUID REFERENCES sources(id);

CREATE TABLE class_materials (
  class_id UUID NOT NULL REFERENCES classrooms(id),
  source_id UUID NOT NULL REFERENCES sources(id),
  PRIMARY KEY (class_id, source_id)
);
