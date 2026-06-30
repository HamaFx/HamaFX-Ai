'use client';

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

// Skip-to-main-content link. Visible only on keyboard focus per WCAG §2.4.1.
// Mounted as the first focusable element in the (app) layout so Tab from
// anywhere in the chrome lands here first.

interface SkipToContentProps {
  /** Target element id. Defaults to "main-content". */
  targetId?: string;
}

export function SkipToContent({ targetId = 'main-content' }: SkipToContentProps) {
  const handleSkip = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    target?.focus();
    target?.scrollIntoView();
  };

  return (
    <a href={`#${targetId}`} className="skip-to-main" onClick={handleSkip}>
      Skip to main content
    </a>
  );
}
