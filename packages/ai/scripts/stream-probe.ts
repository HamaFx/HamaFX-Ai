import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const provider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
});
const result = streamText({
  model: provider('gemini-3.5-flash-lite'),
  prompt: 'Say hi',
  maxOutputTokens: 10,
});
console.log('keys:', Object.keys(result).join(', '));
console.log('toDataStreamResponse type:', typeof (result as Record<string, unknown>).toDataStreamResponse);
console.log('toUIMessageStreamResponse type:', typeof (result as Record<string, unknown>).toUIMessageStreamResponse);
const text = await result.text;
console.log('text:', text);
