// Skip-to-main-content link. Visible only on keyboard focus per WCAG §2.4.1.
// Mounted as the first focusable element in the (app) layout so Tab from
// anywhere in the chrome lands here first.

interface SkipToContentProps {
  /** Target element id. Defaults to "main-content". */
  targetId?: string;
}

export function SkipToContent({ targetId = 'main-content' }: SkipToContentProps) {
  return (
    <a href={`#${targetId}`} className="skip-to-main">
      Skip to main content
    </a>
  );
}
