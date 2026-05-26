import { redirect } from 'next/navigation';

// Default landing inside the (app) group → /chat.
export default function AppRoot(): never {
  redirect('/chat');
}
