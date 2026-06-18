import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { revalidatePath } from 'next/cache';

async function updateProfile(_formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  // Phase A: name updates are disabled in self-hosted mode.
  // const _name = formData.get('name') as string;
  // const _db = getDb();
  // if (_name && _name !== session.user.name) {
  //   await _db.update(schema.users)
  //     .set({ name: _name })
  //     .where(eq(schema.users.id, session.user.id));
  // }

  revalidatePath('/settings/profile');
}

export default async function ProfileSettingsPage() {
  const session = await auth();
  
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-fg">Profile</h2>
        <p className="text-sm text-fg-subtle">Manage your public profile and identity.</p>
      </div>

      <form action={updateProfile} className="card-premium p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Email</label>
          <Input 
            value={session?.user?.email || ''} 
            readOnly 
            disabled 
            className="opacity-50"
          />
          <p className="text-[11px] text-fg-subtle">Your email address cannot be changed right now.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Display Name</label>
          <Input 
            name="name" 
            defaultValue={session?.user?.name || ''} 
            placeholder="Your name"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Save Profile</Button>
        </div>
      </form>
    </div>
  );
}
