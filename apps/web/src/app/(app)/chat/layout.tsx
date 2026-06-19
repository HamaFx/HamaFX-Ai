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

// Chat layout — passes children straight through. The chat page itself is
// full-bleed and renders its own top bar (which hosts the same nav-drawer
// trigger as the global TopBar). The (app) layout's TopBar still mounts
// from the perspective of route segmentation but the ChatScreen covers it
// with a `fixed inset-0 z-50` surface so the user sees the chat-tuned
// chrome, not the generic one.

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
