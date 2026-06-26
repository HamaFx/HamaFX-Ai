'use server';

export async function pingAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  return {
    received: true,
    email: email ? email.slice(0, 10) : null,
    passwordLength: password?.length ?? 0,
  };
}
