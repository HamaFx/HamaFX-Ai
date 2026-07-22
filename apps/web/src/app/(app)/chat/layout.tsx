// SPDX-License-Identifier: Apache-2.0

// Chat layout — passes children straight through. The chat page itself is
// full-bleed and renders its own top bar (which hosts the same nav-drawer
// trigger as the global TopBar). The (app) layout's TopBar still mounts
// from the perspective of route segmentation but the ChatScreen covers it
// with a `fixed inset-0 z-50` surface so the user sees the chat-tuned
// chrome, not the generic one.

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
