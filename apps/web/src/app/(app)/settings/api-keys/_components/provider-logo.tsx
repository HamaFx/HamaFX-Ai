export function ProviderLogo({ id }: { id: string }) {
  const baseClass = "size-5 text-fg shrink-0";
  switch (id) {
    case 'google':
    case 'vertex':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="currentColor">
          <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.102 1.025 5.042 1.926l2.427-2.334C18.155 2.502 15.46 1 12.24 1 5.92 1 1 5.92 1 12.24s4.92 11.24 11.24 11.24c6.6 0 11-4.64 11-11.24 0-.756-.08-1.334-.18-1.955H12.24z" />
        </svg>
      );
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <path d="M2 12h20" />
        </svg>
      );
    case 'anthropic':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="currentColor">
          <path d="M12.4 3h-1.6L5.3 21h1.9l1.6-4.9h6.4l1.6 4.9h1.9L12.4 3zm-3.1 11.5l2.7-8.1 2.7 8.1H9.3z" />
        </svg>
      );
    case 'groq':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'mistral':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 20H4V4h5.5l2.5 4 2.5-4H20v16h-5.5L12 16l-2.5 4z" />
        </svg>
      );
    case 'iamhc':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M6 12h12" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
  }
}
