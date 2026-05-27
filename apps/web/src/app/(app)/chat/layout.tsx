// Chat layout — passes children straight through. The chat page itself is
// full-bleed and renders its own top bar; the parent (app) layout's TopBar
// and BottomNav still appear from the perspective of route segmentation,
// but the ChatScreen component covers them with its own full-height
// surface (z-50). This lets the user swipe back to the bottom-nav by
// closing the chat thread or navigating elsewhere.

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
