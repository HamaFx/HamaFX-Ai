import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

async function main() {
  const vertex = createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION,
  });

  const model = vertex('gemini-2.5-flash');
  
  console.log('Sending request...');
  const result = await generateText({
    model,
    tools: {
      googleSearch: vertex.tools.googleSearch({}),
    },
    prompt: 'What are the top news stories about EUR/USD today? Be brief.',
  });

  console.log(result.text);
  console.log('Tool calls:', result.toolCalls);
}

main().catch(console.error);
