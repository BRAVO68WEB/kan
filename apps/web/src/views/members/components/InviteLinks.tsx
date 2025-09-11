import { t } from "@lingui/core/macro";
import { format } from "date-fns";
import { useState } from "react";
import { HiLink, HiOutlineTrash, HiPlus } from "react-icons/hi2";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export function InviteLinks() {
  const { openModal } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);
  const utils = api.useUtils();

  const { data: inviteLinks, isLoading } = api.member.getInviteLinks.useQuery(
    { workspacePublicId: workspace.publicId },
    { refetchInterval: 60000 } // Refetch every minute to check for expired links
  );

  const deleteInviteLink = api.member.deleteInviteLink.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Invite link deleted`,
        message: t`The invite link has been deleted successfully.`,
        icon: "success",
      });
      utils.member.getInviteLinks.invalidate({ workspacePublicId: workspace.publicId });
      setSelectedLinkId(null);
    },
    onError: () => {
      showPopup({
        header: t`Error deleting invite link`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });

  const handleDelete = (id: number) => {
    setSelectedLinkId(id);
    deleteInviteLink.mutate({ inviteLinkId: id });
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-light-1000 dark:text-dark-1000">
          {t`Invite Links`}
        </h2>
        <Button
          onClick={() => openModal("GENERATE_INVITE_LINK")}
          iconLeft={<HiPlus className="h-4 w-4" />}
          disabled={workspace.role !== "admin"}
        >
          {t`Generate Link`}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-4 text-sm text-light-900 dark:text-dark-900">
          {t`Loading...`}
        </div>
      ) : inviteLinks && inviteLinks.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-md border border-light-200 dark:border-dark-300">
          <table className="min-w-full divide-y divide-light-200 dark:divide-dark-300">
            <thead className="bg-light-100 dark:bg-dark-200">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-light-700 dark:text-dark-700"
                >
                  {t`Link`}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-light-700 dark:text-dark-700"
                >
                  {t`Role`}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-light-700 dark:text-dark-700"
                >
                  {t`Expires`}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-light-700 dark:text-dark-700"
                >
                  {t`Actions`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-200 bg-white dark:divide-dark-300 dark:bg-dark-100">
              {inviteLinks.map((link) => (
                <tr key={link.id}>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <HiLink className="mr-2 h-4 w-4 text-light-700 dark:text-dark-700" />
                      <span className="font-mono text-xs">
                        {link.inviteCode}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-light-900 dark:text-dark-900">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        link.role === "admin"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      }`}
                    >
                      {link.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-light-900 dark:text-dark-900">
                    {format(new Date(link.expiresAt), "MMM d, yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleDelete(link.id)}
                      disabled={selectedLinkId === link.id && deleteInviteLink.isPending}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <HiOutlineTrash className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md bg-light-100 py-4 text-center text-sm text-light-900 dark:bg-dark-200 dark:text-dark-900">
          {t`No active invite links. Generate one to share with others.`}
        </div>
      )}
    </div>
  );
}