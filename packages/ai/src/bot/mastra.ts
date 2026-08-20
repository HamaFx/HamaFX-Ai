import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { runMastraBackgroundText } from '../mastra';
import { appendAssistantMessage, appendUserMessage } from '../persistence';
import type { ResolveModelEnv } from '../vertex-factory';

function botEnv(): ResolveModelEnv {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GOOGLE_VERTEX_PROJECT: process.env.GOOGLE_VERTEX_PROJECT,
    GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS_JSON: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
  };
}

/**
 * Run a bot message through the bounded Mastra worker-style path. The bot no
 * longer falls back to the removed legacy agent; a failed Mastra run is
 * propagated to the command boundary so the user receives an explicit error.
 */
export async function tryMastraBotMessage(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  system: string;
}): Promise<string | null> {
  const { settings } = await getUserWithSettings(args.userId);
  if (!settings) return null;

  try {
    // Generate before persisting so a failed Mastra attempt cannot leave a
    // duplicate user message when the caller falls back to the legacy path.
    const result = await runMastraBackgroundText({
      userId: args.userId,
      threadId: args.threadId,
      task: 'bot',
      prompt: args.prompt,
      system: args.system,
      settings,
      env: botEnv(),
    });
    if (result.text.length === 0) return null;

    await appendUserMessage(args.userId, args.threadId, args.userMessage);
    const assistant: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text: result.text }],
    };
    await appendAssistantMessage(args.userId, args.threadId, assistant);
    return result.text;
  } catch (error) {
    throw error;
  }
}
