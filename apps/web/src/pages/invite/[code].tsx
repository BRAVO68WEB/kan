import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { format } from "date-fns";
import { useEffect, useState } from "react";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import { InviteAuth } from "~/components/InviteAuth";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";
import LoadingSpinner from "~/components/LoadingSpinner";
import { api } from "~/utils/api";

export default function InvitePage() {
  const router = useRouter();
  const { code } = router.query;
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMagicLinkSent, setIsMagicLinkSent] = useState<boolean>(false);

  const { data: session, status } = authClient.useSession();
  const acceptInvite = api.member.acceptInviteLink.useMutation();
  
  // Fetch invite information when code is available
  const { 
    data: inviteInfo, 
    isLoading: isLoadingInviteInfo, 
    isError: isInviteInfoError 
  } = api.member.getInviteInfo.useQuery(
    { inviteCode: typeof code === 'string' ? code : '' },
    { enabled: typeof code === 'string' && code.length > 0 }
  );

  useEffect(() => {
    if (status === "authenticated" && session?.user.id && code && typeof code === "string") {
      setIsProcessing(true);
      acceptInvite.mutate({
        inviteCode: code,
        userId: session.user.id
      }, {
        onSuccess: (data) => {
          if (data.workspacePublicId && data.workspaceSlug) {
            router.push(`/${data.workspaceSlug}/boards`);
          } else {
            router.push("/boards");
          }
        },
        onError: (error) => {
          setError(error.message);
          setIsProcessing(false);
        }
      });
    }
  }, [status, session, code]);

  const handleMagicLinkSent = (value: boolean) => {
    setIsMagicLinkSent(value);
  };
  
  const invalidInvite = (!isLoadingInviteInfo && !inviteInfo) || isInviteInfoError;

  return (
    <>
      <PageHead title={
        inviteInfo 
          ? t`Join ${inviteInfo.workspaceName} | kan.bn` 
          : t`Join Workspace | kan.bn`
      } />
      <main className="h-screen bg-light-100 pt-20 dark:bg-dark-50 sm:pt-0">
        <div className="justify-top flex h-full flex-col items-center px-4 sm:justify-center">
          <div className="z-10 flex w-full flex-col items-center">
            <h1 className="mb-6 text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              kan.bn
            </h1>
            
            {isLoadingInviteInfo ? (
              <div className="flex flex-col items-center justify-center">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-light-900 dark:text-dark-900">
                  {t`Loading invitation details...`}
                </p>
              </div>
            ) : invalidInvite ? (
              <div className="text-center">
                <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                  {t`Invalid Invitation`}
                </p>
                <div className="mb-6 w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900 dark:text-red-200">
                  {t`This invitation link is invalid or has expired.`}
                </div>
                <Button onClick={() => router.push('/boards')}>
                  {t`Go to Dashboard`}
                </Button>
              </div>
            ) : inviteInfo?.isExpired ? (
              <div className="text-center">
                <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                  {t`Expired Invitation`}
                </p>
                <div className="mb-6 w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {t`This invitation to join ${inviteInfo.workspaceName} has expired.`}
                </div>
                <Button onClick={() => router.push('/boards')}>
                  {t`Go to Dashboard`}
                </Button>
              </div>
            ) : inviteInfo?.isUsed ? (
              <div className="text-center">
                <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                  {t`Invitation Already Used`}
                </p>
                <div className="mb-6 w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {t`This invitation to join ${inviteInfo.workspaceName} has already been used.`}
                </div>
                <Button onClick={() => router.push('/boards')}>
                  {t`Go to Dashboard`}
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-4 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                  {isMagicLinkSent
                    ? t`Check your inbox`
                    : status === "authenticated"
                    ? t`Joining workspace...`
                    : t`Join ${inviteInfo?.workspaceName}`}
                </p>
                
                {inviteInfo && (
                  <div className="mb-6 w-full max-w-md rounded-lg border border-light-300 bg-light-100 p-4 text-light-900 dark:border-dark-400 dark:bg-dark-300 dark:text-dark-900">
                    <div className="mb-2">
                      <span className="font-medium">{t`Workspace:`}</span> {inviteInfo.workspaceName}
                    </div>
                    {inviteInfo.inviterName && (
                      <div className="mb-2">
                        <span className="font-medium">{t`Invited by:`}</span> {inviteInfo.inviterName}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">{t`Expires:`}</span> {format(new Date(inviteInfo.expiresAt), "MMM d, yyyy")}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mb-6 w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900 dark:text-red-200">
                    {error}
                  </div>
                )}

                {status === "authenticated" ? (
                  <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
                    <div className="text-center">
                      {isProcessing ? (
                        <div className="flex flex-col items-center">
                          <LoadingSpinner />
                          <p className="mt-2 text-light-900 dark:text-dark-900">
                            {t`Processing your invitation...`}
                          </p>
                        </div>
                      ) : (
                        <>
                          <p className="mb-4 text-light-900 dark:text-dark-900">
                            {t`Click the button below to join ${inviteInfo?.workspaceName}.`}
                          </p>
                          <Button
                            onClick={() => {
                              if (code && typeof code === "string") {
                                setIsProcessing(true);
                                acceptInvite.mutate({
                                  inviteCode: code,
                                  userId: session.user.id
                                });
                              }
                            }}
                            isLoading={isProcessing}
                          >
                            {t`Join Workspace`}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ) : isMagicLinkSent ? (
                  <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                    <p className="text-md mt-2 text-center text-light-1000 dark:text-dark-1000">
                      {t`Click on the link we've sent to your email to sign in and join the workspace.`}
                    </p>
                  </div>
                ) : (
                  <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
                    <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                      <p className="mb-4 text-center text-light-900 dark:text-dark-900">
                        {t`Sign in or create an account to join ${inviteInfo?.workspaceName}.`}
                      </p>
                      <InviteAuth 
                        inviteCode={typeof code === 'string' ? code : ''} 
                        setIsMagicLinkSent={handleMagicLinkSent} 
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <PatternedBackground />
        </div>
      </main>
    </>
  );
}