/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import { telemetryConfig } from './telemetry';

async function main() {
  const vertex = createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT || '',
    location: process.env.GOOGLE_VERTEX_LOCATION || '',
  });

  const model = vertex('gemini-2.5-flash');
  
  console.info('Sending request...');
  const result = await generateText({
    model,
    tools: {
      googleSearch: vertex.tools.googleSearch({}),
    },
    prompt: 'What are the top news stories about EUR/USD today? Be brief.',
    ...telemetryConfig(),
  });

  console.info(result.text);
  console.info('Tool calls:', result.toolCalls);
}

main().catch(console.error);
