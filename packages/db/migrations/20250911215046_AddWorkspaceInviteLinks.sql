-- Create the table for workspace invite links
CREATE TABLE "workspace_invite_link" (
    "id" BIGSERIAL PRIMARY KEY,
    "workspaceId" BIGINT NOT NULL,
    "inviteCode" VARCHAR(50) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'member',
    "isUsed" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "expiresAt" TIMESTAMP NOT NULL,
    "usedAt" TIMESTAMP,
    "usedBy" UUID,
    CONSTRAINT "workspace_invite_link_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE,
    CONSTRAINT "workspace_invite_link_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL,
    CONSTRAINT "workspace_invite_link_usedBy_fkey" FOREIGN KEY ("usedBy") REFERENCES "user"("id") ON DELETE SET NULL,
    CONSTRAINT "workspace_invite_link_inviteCode_unique" UNIQUE ("inviteCode")
);

-- Enable RLS (Row-Level Security) for the table
ALTER TABLE "workspace_invite_link" ENABLE ROW LEVEL SECURITY;

-- Add index on inviteCode for faster lookups
CREATE INDEX "workspace_invite_link_inviteCode_idx" ON "workspace_invite_link" ("inviteCode");

-- Add index on workspaceId for faster filtering by workspace
CREATE INDEX "workspace_invite_link_workspaceId_idx" ON "workspace_invite_link" ("workspaceId");