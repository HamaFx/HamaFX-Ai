import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token || '';

  return (
    <Suspense fallback={<div className="flex justify-center p-8"><span className="text-fg-subtle">Loading...</span></div>}>
      <ResetPasswordForm token={token} />
    </Suspense>
  );
}
