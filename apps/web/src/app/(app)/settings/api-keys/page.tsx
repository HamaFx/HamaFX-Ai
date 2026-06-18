import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { revalidatePath } from 'next/cache';
import { encryptByok, decryptByok } from '@hamafx/shared/encryption';

async function updateApiKeys(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const openai = formData.get('openai') as string;
  const anthropic = formData.get('anthropic') as string;
  const google = formData.get('google') as string;

  const keys = {
    ...(openai && { openai }),
    ...(anthropic && { anthropic }),
    ...(google && { google }),
  };

  const db = getDb();
  await db.update(schema.userSettings)
    .set({ aiApiKeys: encryptByok(keys) })
    .where(eq(schema.userSettings.userId, session.user.id));
    
  revalidatePath('/settings/api-keys');
}

export default async function ApiKeysSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const [settings] = await db.select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  let currentKeys: Record<string, string> = {};
  if (settings?.aiApiKeys) {
    const decrypted = decryptByok(settings.aiApiKeys);
    if (decrypted) {
      currentKeys = decrypted as Record<string, string>;
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-fg">API Keys</h2>
        <p className="text-sm text-fg-subtle">HamaFX-Ai is BYOK. Provide your own keys for the AI models you want to use.</p>
      </div>

      <form action={updateApiKeys} className="card-premium p-4 flex flex-col gap-6">
        
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Google AI (Gemini)</label>
          <Input 
            name="google" 
            type="password"
            defaultValue={currentKeys.google || ''} 
            placeholder="AIzaSy..."
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Anthropic (Claude)</label>
          <Input 
            name="anthropic" 
            type="password"
            defaultValue={currentKeys.anthropic || ''} 
            placeholder="sk-ant-..."
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">OpenAI (ChatGPT)</label>
          <Input 
            name="openai" 
            type="password"
            defaultValue={currentKeys.openai || ''} 
            placeholder="sk-..."
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Save Keys</Button>
        </div>
      </form>
    </div>
  );
}
