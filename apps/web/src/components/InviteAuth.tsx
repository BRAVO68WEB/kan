import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { usePopup } from "~/providers/popup";

interface FormValues {
  email: string;
}

interface InviteAuthProps {
  inviteCode: string;
  setIsMagicLinkSent: (value: boolean) => void;
}

const EmailSchema = z.object({
  email: z.string().email(),
});

export function InviteAuth({ inviteCode, setIsMagicLinkSent }: InviteAuthProps) {
  const router = useRouter();
  const [isLoginWithEmailPending, setIsLoginWithEmailPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { showPopup } = usePopup();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(EmailSchema),
  });

  const handleLoginWithEmail = async (email: string) => {
    setIsLoginWithEmailPending(true);
    setLoginError(null);

    // Use a callback URL that includes the invite code
    const callbackURL = `/invite/${inviteCode}`;

    await authClient.signIn.magicLink(
      {
        email,
        callbackURL,
      },
      {
        onSuccess: () => setIsMagicLinkSent(true),
        onError: ({ error }) => {
          setLoginError(error.message);
          setIsLoginWithEmailPending(false);
        }
      }
    );
  };

  const onSubmit = ({ email }: FormValues) => {
    handleLoginWithEmail(email);
  };

  return (
    <div>
      {loginError && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {loginError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-light-900 dark:text-dark-900"
          >
            {t`Email address`}
          </label>
          <div className="mt-1">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="email@example.com"
              {...register("email")}
              disabled={isLoginWithEmailPending}
              errorMessage={errors.email?.message}
            />
          </div>
        </div>

        <div>
          <Button
            type="submit"
            isFullWidth
            isLoading={isLoginWithEmailPending}
            disabled={isLoginWithEmailPending}
          >
            {t`Continue with magic link`}
          </Button>
        </div>

        <div className="text-center text-xs text-light-700 dark:text-dark-700">
          <Trans>
            By continuing, you agree to kan.bn's{" "}
            <a
              href="https://kan.bn/terms"
              className="font-medium text-light-700 hover:text-light-900 dark:text-dark-700 dark:hover:text-dark-900"
              target="_blank"
              rel="noreferrer"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://kan.bn/privacy"
              className="font-medium text-light-700 hover:text-light-900 dark:text-dark-700 dark:hover:text-dark-900"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </Trans>
        </div>
      </form>
    </div>
  );
}