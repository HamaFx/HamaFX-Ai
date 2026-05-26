import { redirect } from 'next/navigation';

// Root is just a redirect — middleware will bounce to /login if not authed.
export default function RootPage(): never {
  redirect('/chat');
}
