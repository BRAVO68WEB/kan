import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";

import * as memberRepo from "@kan/db/repository/member.repo";
import * as subscriptionRepo from "@kan/db/repository/subscription.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { getSubscriptionByPlan, hasUnlimitedSeats } from "@kan/shared/utils";
import { updateSubscriptionSeats } from "@kan/stripe";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

export const memberRouter = createTRPCRouter({
  invite: protectedProcedure
    .meta({
      openapi: {
        summary: "Invite a member to a workspace",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/invite",
        description: "Invites a member to a workspace",
        tags: ["Workspaces"],
        protect: true,
      },
    })
    .input(
      z.object({
        email: z.string().email(),
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof memberRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicIdWithMembers(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, workspace.id, "admin");

      const isInvitedEmailAlreadyMember = workspace.members.some(
        (member) => member.email === input.email,
      );

      if (isInvitedEmailAlreadyMember) {
        throw new TRPCError({
          message: `User with email ${input.email} is already a member of this workspace`,
          code: "CONFLICT",
        });
      }

      if (process.env.NEXT_PUBLIC_KAN_ENV === "cloud") {
        const subscriptions = await subscriptionRepo.getByReferenceId(
          ctx.db,
          workspace.publicId,
        );

        // get the active subscriptions
        const activeTeamSubscription = getSubscriptionByPlan(
          subscriptions,
          "team",
        );
        const activeProSubscription = getSubscriptionByPlan(
          subscriptions,
          "pro",
        );
        const unlimitedSeats = hasUnlimitedSeats(subscriptions);

        if (!activeTeamSubscription && !activeProSubscription) {
          throw new TRPCError({
            message: `Workspace with public ID ${workspace.publicId} does not have an active subscription`,
            code: "NOT_FOUND",
          });
        }

        // Update the Stripe subscription
        if (activeTeamSubscription?.stripeSubscriptionId && !unlimitedSeats) {
          try {
            await updateSubscriptionSeats(
              activeTeamSubscription.stripeSubscriptionId,
              1,
            );
          } catch (error) {
            console.error("Failed to update Stripe subscription seats:", error);
            throw new TRPCError({
              message: `Failed to update subscription for the new member.`,
              code: "INTERNAL_SERVER_ERROR",
            });
          }
        }
      }

      const existingUser = await userRepo.getByEmail(ctx.db, input.email);

      const invite = await memberRepo.create(ctx.db, {
        workspaceId: workspace.id,
        email: input.email,
        userId: existingUser?.id ?? null,
        createdBy: userId,
        role: "member",
        status: "invited",
      });

      if (!invite)
        throw new TRPCError({
          message: `Unable to invite user with email ${input.email}`,
          code: "INTERNAL_SERVER_ERROR",
        });

      const { status } = await ctx.auth.api.signInMagicLink({
        email: input.email,
        callbackURL: `/boards?type=invite&memberPublicId=${invite.publicId}`,
      });

      if (!status) {
        console.error("Failed to send magic link invitation:", {
          email: input.email,
          callbackURL: `/boards?type=invite&memberPublicId=${invite.publicId}`,
        });

        await memberRepo.softDelete(ctx.db, {
          memberId: invite.id,
          deletedAt: new Date(),
          deletedBy: userId,
        });

        throw new TRPCError({
          message: `Failed to send magic link invitation to user with email ${input.email}.`,
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      return invite;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a member from a workspace",
        method: "DELETE",
        path: "/workspaces/{workspacePublicId}/members/{memberPublicId}",
        description: "Deletes a member from a workspace",
        tags: ["Workspaces"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        memberPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, workspace.id, "admin");

      const member = await memberRepo.getByPublicId(
        ctx.db,
        input.memberPublicId,
      );

      if (!member)
        throw new TRPCError({
          message: `Member with public ID ${input.memberPublicId} not found`,
          code: "NOT_FOUND",
        });

      const deletedMember = await memberRepo.softDelete(ctx.db, {
        memberId: member.id,
        deletedAt: new Date(),
        deletedBy: userId,
      });

      if (!deletedMember)
        throw new TRPCError({
          message: `Failed to delete member with public ID ${input.memberPublicId}`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Handle subscription seat decrement for cloud environment
      if (process.env.NEXT_PUBLIC_KAN_ENV === "cloud") {
        const subscriptions = await subscriptionRepo.getByReferenceId(
          ctx.db,
          workspace.publicId,
        );

        // get the active subscriptions
        const activeTeamSubscription = getSubscriptionByPlan(
          subscriptions,
          "team",
        );
        const unlimitedSeats = hasUnlimitedSeats(subscriptions);

        // Only decrease seats if there's an active subscription and stripeSubscriptionId
        if (activeTeamSubscription?.stripeSubscriptionId && !unlimitedSeats) {
          try {
            await updateSubscriptionSeats(
              activeTeamSubscription.stripeSubscriptionId,
              -1,
            );
          } catch (error) {
            console.error(
              "Failed to decrease Stripe subscription seats:",
              error,
            );
          }
        }
      }

      return { success: true };
    }),
    
  generateInviteLink: protectedProcedure
    .meta({
      openapi: {
        summary: "Generate an invite link for a workspace",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/generate-invite-link",
        description: "Generates an invite link for a workspace that can be shared directly",
        tags: ["Workspaces"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        role: z.enum(["member", "admin"]).default("member"),
        expiresIn: z.number().int().min(1).max(30).default(7), // Days until expiration
      }),
    )
    .output(z.object({
      inviteLink: z.string(),
      inviteCode: z.string(),
      expiresAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicIdWithMembers(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, workspace.id, "admin");

      // If we're on cloud, check subscription limits
      if (process.env.NEXT_PUBLIC_KAN_ENV === "cloud") {
        const subscriptions = await subscriptionRepo.getByReferenceId(
          ctx.db,
          workspace.publicId,
        );

        // get the active subscriptions
        const activeTeamSubscription = getSubscriptionByPlan(
          subscriptions,
          "team",
        );
        const activeProSubscription = getSubscriptionByPlan(
          subscriptions,
          "pro",
        );
        const unlimitedSeats = hasUnlimitedSeats(subscriptions);

        if (!activeTeamSubscription && !activeProSubscription) {
          throw new TRPCError({
            message: `Workspace with public ID ${workspace.publicId} does not have an active subscription`,
            code: "FORBIDDEN",
          });
        }
      }

      // Generate a unique invite code
      const inviteCode = nanoid(12);
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresIn);

      // Create an invite record
      const invite = await memberRepo.createInviteLink(ctx.db, {
        workspaceId: workspace.id,
        inviteCode,
        createdBy: userId,
        role: input.role,
        expiresAt,
      });

      if (!invite)
        throw new TRPCError({
          message: `Unable to create invite link`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Construct the invite link
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const inviteLink = `${baseUrl}/invite/${inviteCode}`;

      return {
        inviteLink,
        inviteCode: invite.inviteCode,
        expiresAt: invite.expiresAt,
      };
    }),

  acceptInviteLink: publicProcedure
    .meta({
      openapi: {
        summary: "Accept an invite link",
        method: "POST",
        path: "/invites/accept",
        description: "Accepts an invitation via invite link",
        tags: ["Invites"],
        protect: false,
      },
    })
    .input(
      z.object({
        inviteCode: z.string().min(12),
        userId: z.string().uuid(),
      }),
    )
    .output(z.object({
      success: z.boolean(),
      workspacePublicId: z.string().optional(),
      workspaceSlug: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const invite = await memberRepo.getInviteLinkByCode(ctx.db, input.inviteCode);

      if (!invite || invite.isUsed || new Date() > invite.expiresAt)
        throw new TRPCError({
          message: `Invalid or expired invite link`,
          code: "BAD_REQUEST",
        });

      const workspace = await workspaceRepo.getById(ctx.db, invite.workspaceId);
      
      if (!workspace)
        throw new TRPCError({
          message: `Workspace not found`,
          code: "NOT_FOUND",
        });

      // Check if the user is already a member of the workspace
      const isMember = await workspaceRepo.isUserInWorkspace(
        ctx.db,
        input.userId,
        invite.workspaceId
      );

      if (isMember) {
        throw new TRPCError({
          message: `User is already a member of this workspace`,
          code: "CONFLICT",
        });
      }

      // Add the user to the workspace
      const user = await userRepo.getById(ctx.db, input.userId);
      
      if (!user)
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });

      await memberRepo.create(ctx.db, {
        workspaceId: invite.workspaceId,
        email: user.email,
        userId: user.id,
        createdBy: invite.createdBy,
        role: invite.role as "admin" | "member" | "guest",
        status: "active",
      });

      // Mark the invite as used
      await memberRepo.markInviteLinkAsUsed(ctx.db, invite.id, input.userId);

      return {
        success: true,
        workspacePublicId: workspace.publicId,
        workspaceSlug: workspace.slug,
      };
    }),
    
  getInviteInfo: publicProcedure
    .meta({
      openapi: {
        summary: "Get information about an invite link",
        method: "GET",
        path: "/invites/{inviteCode}/info",
        description: "Gets information about an invite link without requiring authentication",
        tags: ["Invites"],
        protect: false,
      },
    })
    .input(
      z.object({
        inviteCode: z.string().min(12),
      }),
    )
    .output(z.object({
      workspaceName: z.string(),
      workspaceSlug: z.string(),
      inviterName: z.string().nullable(),
      expiresAt: z.date(),
      isExpired: z.boolean(),
      isUsed: z.boolean(),
    }))
    .query(async ({ ctx, input }) => {
      const invite = await memberRepo.getInviteLinkByCode(ctx.db, input.inviteCode);

      if (!invite)
        throw new TRPCError({
          message: `Invalid invite link`,
          code: "NOT_FOUND",
        });

      const workspace = await workspaceRepo.getById(ctx.db, invite.workspaceId);
      
      if (!workspace)
        throw new TRPCError({
          message: `Workspace not found`,
          code: "NOT_FOUND",
        });
        
      // Get inviter information
      const inviter = await userRepo.getById(ctx.db, invite.createdBy);
      
      const now = new Date();
      const isExpired = now > invite.expiresAt;

      return {
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        inviterName: inviter?.name || null,
        expiresAt: invite.expiresAt,
        isExpired,
        isUsed: invite.isUsed,
      };
    }),
    
  getInviteLinks: protectedProcedure
    .meta({
      openapi: {
        summary: "Get invite links for a workspace",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/invite-links",
        description: "Gets all active invite links for a workspace",
        tags: ["Workspaces"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(z.array(
      z.object({
        id: z.number(),
        inviteCode: z.string(),
        role: z.string(),
        createdAt: z.date(),
        expiresAt: z.date(),
      })
    ))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: `Workspace with public ID ${input.workspacePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, workspace.id, "admin");

      const inviteLinks = await memberRepo.getInviteLinksByWorkspaceId(
        ctx.db,
        workspace.id,
        false
      );

      // Filter out expired links
      const now = new Date();
      return inviteLinks
        .filter(link => new Date(link.expiresAt) > now)
        .map(link => ({
          id: link.id,
          inviteCode: link.inviteCode,
          role: link.role,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
        }));
    }),

  deleteInviteLink: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete an invite link",
        method: "DELETE",
        path: "/invite-links/{inviteLinkId}",
        description: "Deletes an invite link by its ID",
        tags: ["Workspaces"],
        protect: true,
      },
    })
    .input(
      z.object({
        inviteLinkId: z.number(),
      }),
    )
    .output(z.object({
      success: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      // Get the invite link to check workspace ownership
      const inviteLink = await memberRepo.getInviteLinkByCode(
        ctx.db, 
        input.inviteLinkId.toString()
      );
      
      if (!inviteLink)
        throw new TRPCError({
          message: `Invite link not found`,
          code: "NOT_FOUND",
        });

      // Verify user has admin permissions in this workspace
      await assertUserInWorkspace(ctx.db, userId, inviteLink.workspaceId, "admin");

      // Delete the invite link
      await memberRepo.deleteInviteLink(ctx.db, input.inviteLinkId);

      return {
        success: true,
      };
    }),
});
