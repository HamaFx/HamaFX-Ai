// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/chat');
  } else {
    redirect('/login');
  }
}
