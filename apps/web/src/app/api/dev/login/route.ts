import { redirect } from 'next/navigation';
import { signIn } from '@/auth';

export async function GET() {
  console.error('[dev-login] Starting dev login...');

  let result: unknown;
  try {
    result = await signIn('credentials', {
      email: 'dev@hamafx.ai',
      password: 'devpass',
      redirect: false,
    });
    console.error('[dev-login] signIn OK, result:', JSON.stringify(result));
  } catch (e: unknown) {
    console.error('[dev-login] signIn threw:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    if (e instanceof Error && e.stack) {
      console.error('[dev-login] stack:', e.stack.slice(0, 500));
    }
  }

  console.error('[dev-login] Redirecting to /chat...');
  redirect('/chat');
}
