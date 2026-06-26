import { redirect } from 'next/navigation';
import { signIn } from '@/auth';

export async function GET() {
  try {
    await signIn('credentials', {
      email: 'dev@hamafx.ai',
      password: 'devpass',
      redirect: false,
    });
  } catch {
    // signIn throws on redirect — ignore
  }

  redirect('/chat');
}
