// SPDX-License-Identifier: Apache-2.0

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
