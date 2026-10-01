CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Folder_teamId_parentId_type_name_idx" ON "Folder"("teamId", "parentId", "type", "name");
CREATE INDEX "Folder_name_trgm_idx" ON "Folder" USING GIN ("name" gin_trgm_ops);
