import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { HiCheck, HiClipboard, HiXMark } from "react-icons/hi2";
import { z } from "zod";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export function GenerateInviteLinkForm() {
  const { closeModal } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const utils = api.useUtils();

  const schema = z.object({
    role: z.enum(["member", "admin"]).default("member"),
    expiresIn: z.number().int().min(1).max(30).default(7),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "member",
      expiresIn: 7,
    },
  });

  const generateInviteLink = api.member.generateInviteLink.useMutation({
    onSuccess: (data) => {
      setGeneratedLink(data.inviteLink);
    },
    onError: () => {
      showPopup({
        header: t`Error generating invite link`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    generateInviteLink.mutate({
      workspacePublicId: workspace.publicId,
      role: data.role,
      expiresIn: data.expiresIn,
    });
  };

  const handleCopy = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    closeModal();
    if (generatedLink) {
      utils.member.getInviteLinks.invalidate({ workspacePublicId: workspace.publicId });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {t`Generate Invite Link`}
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={handleClose}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        {!generatedLink ? (
          <>
            <div className="mb-4">
              <label
                htmlFor="role"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-1000"
              >
                {t`Role`}
              </label>
              <select
                id="role"
                {...register("role")}
                className="block w-full rounded-md border-0 bg-light-50 py-1.5 text-light-1000 shadow-sm ring-1 ring-inset ring-light-300 focus:ring-2 focus:ring-inset focus:ring-light-400 dark:bg-dark-50 dark:text-dark-1000 dark:ring-dark-300 dark:focus:ring-dark-500 sm:text-sm sm:leading-6"
              >
                <option value="member">{t`Member`}</option>
                <option value="admin">{t`Admin`}</option>
              </select>
            </div>

            <div className="mb-4">
              <label
                htmlFor="expiresIn"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-dark-1000"
              >
                {t`Expires In (Days)`}
              </label>
              <Input
                id="expiresIn"
                type="number"
                min={1}
                max={30}
                {...register("expiresIn", { valueAsNumber: true })}
                errorMessage={errors.expiresIn?.message}
              />
            </div>
          </>
        ) : (
          <div className="mb-4">
            <p className="mb-2 text-sm text-light-900 dark:text-dark-900">
              {t`Share this invite link with others to join your workspace. The link will expire in the specified number of days.`}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={generatedLink}
                readOnly
                className="flex-grow pr-10"
              />
              <Button
                type="button"
                onClick={handleCopy}
                variant="secondary"
                className="whitespace-nowrap"
                iconLeft={copied ? <HiCheck className="h-4 w-4" /> : <HiClipboard className="h-4 w-4" />}
              >
                {copied ? t`Copied` : t`Copy`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end border-t border-light-600 px-5 py-4 dark:border-dark-600">
        {!generatedLink ? (
          <Button
            type="submit"
            isLoading={generateInviteLink.isPending}
            disabled={generateInviteLink.isPending}
          >
            {t`Generate Link`}
          </Button>
        ) : (
          <Button type="button" onClick={handleClose}>
            {t`Done`}
          </Button>
        )}
      </div>
    </form>
  );
}