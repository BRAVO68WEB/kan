import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { MemberRole, MemberStatus } from "@kan/db/schema";
import { workspaceInviteLinks, workspaceMembers } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  memberInput: {
    userId: string | null;
    email: string;
    workspaceId: number;
    createdBy: string;
    role: MemberRole;
    status: MemberStatus;
  },
) => {
  const [result] = await db
    .insert(workspaceMembers)
    .values({
      publicId: generateUID(),
      email: memberInput.email,
      userId: memberInput.userId,
      workspaceId: memberInput.workspaceId,
      createdBy: memberInput.createdBy,
      role: memberInput.role,
      status: memberInput.status,
    })
    .returning({
      id: workspaceMembers.id,
      publicId: workspaceMembers.publicId,
    });

  return result;
};

export const getByPublicId = async (db: dbClient, publicId: string) => {
  return db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.publicId, publicId),
  });
};

export const getByEmailAndStatus = async (
  db: dbClient,
  email: string,
  status: MemberStatus,
) => {
  return db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.email, email),
      eq(workspaceMembers.status, status),
      isNull(workspaceMembers.deletedAt),
    ),
  });
};

export const acceptInvite = async (
  db: dbClient,
  args: { memberId: number; userId: string },
) => {
  const [result] = await db
    .update(workspaceMembers)
    .set({ status: "active", userId: args.userId })
    .where(eq(workspaceMembers.id, args.memberId))
    .returning({
      id: workspaceMembers.id,
      publicId: workspaceMembers.publicId,
    });

  return result;
};

export const softDelete = async (
  db: dbClient,
  args: {
    memberId: number;
    deletedAt: Date;
    deletedBy: string;
  },
) => {
  const [result] = await db
    .update(workspaceMembers)
    .set({ deletedAt: args.deletedAt, deletedBy: args.deletedBy })
    .where(
      and(
        eq(workspaceMembers.id, args.memberId),
        isNull(workspaceMembers.deletedAt),
      ),
    )
    .returning({
      id: workspaceMembers.id,
      publicId: workspaceMembers.publicId,
    });

  return result;
};

// Workspace Invite Links functions

export const createInviteLink = async (
  db: dbClient,
  args: {
    workspaceId: number;
    inviteCode: string;
    createdBy: string;
    role: string;
    expiresAt: Date;
  },
) => {
  const [result] = await db
    .insert(workspaceInviteLinks)
    .values({
      workspaceId: args.workspaceId,
      inviteCode: args.inviteCode,
      createdBy: args.createdBy,
      role: args.role,
      expiresAt: args.expiresAt,
    })
    .returning({
      id: workspaceInviteLinks.id,
      inviteCode: workspaceInviteLinks.inviteCode,
      expiresAt: workspaceInviteLinks.expiresAt,
    });

  return result;
};

export const getInviteLinkByCode = async (db: dbClient, inviteCode: string) => {
  return db.query.workspaceInviteLinks.findFirst({
    where: eq(workspaceInviteLinks.inviteCode, inviteCode),
  });
};

export const markInviteLinkAsUsed = async (
  db: dbClient,
  inviteLinkId: number,
  userId?: string,
) => {
  return db
    .update(workspaceInviteLinks)
    .set({
      isUsed: true,
      usedAt: new Date(),
      usedBy: userId,
    })
    .where(eq(workspaceInviteLinks.id, inviteLinkId));
};

export const getInviteLinksByWorkspaceId = async (
  db: dbClient,
  workspaceId: number,
  includeExpired = false,
) => {
  const query = {
    where: includeExpired
      ? eq(workspaceInviteLinks.workspaceId, workspaceId)
      : and(
          eq(workspaceInviteLinks.workspaceId, workspaceId),
          eq(workspaceInviteLinks.isUsed, false),
        ),
  };

  return db.query.workspaceInviteLinks.findMany(query);
};

export const deleteInviteLink = async (
  db: dbClient,
  inviteLinkId: number,
) => {
  return db
    .delete(workspaceInviteLinks)
    .where(eq(workspaceInviteLinks.id, inviteLinkId));
};
