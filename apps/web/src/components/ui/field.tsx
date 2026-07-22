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

import { Children, type ReactElement, type ReactNode, cloneElement } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: ReactNode;
  /** The `id` of the wrapped input and the `htmlFor` of the label. */
  htmlFor: string;
  error?: string | null;
  required?: boolean;
  helper?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
  className?: string;
}

/**
 * Reusable field primitive.
 *
 * Usage:
 *   <Field label="Level" htmlFor="alert-level" error={fieldErrors.level}>
 *     <Input id="alert-level" value={level} onChange={...} />
 *   </Field>
 *
 * The child is cloned so it receives the correct `id` and an
 * `aria-describedby` pointer when an error is present.
 */
export function Field({ label, htmlFor, error, required, helper, children, className }: FieldProps) {
  const hasError = error !== undefined && error !== null && error.length > 0;
  const errorId = `${htmlFor}-error`;

  const child = Children.only(children);
  const input = cloneElement(child, {
    id: htmlFor,
    ...(hasError ? { 'aria-describedby': errorId } : {}),
  });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label
        htmlFor={htmlFor}
        className="text-fg-subtle text-body-sm uppercase tracking-wide"
      >
        {label}
        {required ? <span className="text-danger ml-1">*</span> : null}
      </label>
      {input}
      {helper ? <p className="text-fg-subtle text-xs">{helper}</p> : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
