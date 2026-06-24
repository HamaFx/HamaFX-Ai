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

'use client';

import { useState, useTransition } from 'react';
import { Download, Upload, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportKeysAction, importKeysAction } from '../../actions';

export function ExportImportKeys() {
  const [exportPassword, setExportPassword] = useState('');
  const [exportedPayload, setExportedPayload] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExportPending, startExportTransition] = useTransition();

  const [importPayload, setImportPayload] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [isImportPending, startImportTransition] = useTransition();

  async function handleExport() {
    if (exportPassword.length < 8) {
      toast.error('Export password must be at least 8 characters long');
      return;
    }

    startExportTransition(async () => {
      const res = await exportKeysAction(exportPassword);
      if (res.ok && res.payload) {
        setExportedPayload(res.payload);
        toast.success('Backup payload generated successfully');
      } else {
        toast.error(res.error || 'Failed to generate backup payload');
      }
    });
  }

  async function handleCopy() {
    if (!exportedPayload) return;
    try {
      await navigator.clipboard.writeText(exportedPayload);
      setCopied(true);
      toast.success('Backup payload copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  async function handleImport() {
    if (!importPayload.trim()) {
      toast.error('Please enter the backup payload');
      return;
    }
    if (!importPassword) {
      toast.error('Please enter the decryption password');
      return;
    }

    startImportTransition(async () => {
      const res = await importKeysAction(importPayload.trim(), importPassword);
      if (res.ok) {
        toast.success(`Successfully imported ${res.importedCount} keys!`);
        setImportPayload('');
        setImportPassword('');
      } else {
        toast.error(res.error || 'Failed to import keys');
      }
    });
  }

  return (
    <details className="border border-divider bg-bg-elev-1 rounded-lg overflow-hidden mt-2">
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elev-2 transition-colors">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-fg">Backup & Key Migration</span>
          <span className="text-caption text-fg-subtle">
            Export your encrypted API keys for backup, or import them on another device.
          </span>
        </div>
        <span className="text-caption text-fg-subtle">▾</span>
      </summary>

      <div className="border-t border-divider p-4 grid grid-cols-1 md:grid-cols-2 gap-6 bg-bg-elev-2/10">
        {/* Export Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-brand shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">
              Export API Keys
            </h3>
          </div>
          <p className="text-[11px] text-fg-subtle leading-relaxed">
            Encrypt your configured API keys using a strong password. You will need this password to
            decrypt and restore your keys later.
          </p>

          <div className="flex flex-col gap-1">
            <label htmlFor="export-pwd" className="text-[10px] font-bold text-fg-subtle uppercase">
              Choose Backup Password
            </label>
            <Input
              id="export-pwd"
              type="password"
              placeholder="Min. 8 characters"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className="text-xs"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={isExportPending || exportPassword.length < 8}
            loading={isExportPending}
            className="w-full sm:w-auto self-start"
          >
            {isExportPending ? 'Generating…' : 'Generate Backup Payload'}
          </Button>

          {exportedPayload && (
            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-[10px] font-bold text-fg-subtle uppercase flex justify-between items-center">
                <span>Backup Payload</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-brand hover:underline font-semibold flex items-center gap-1 normal-case"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </label>
              <textarea
                readOnly
                value={exportedPayload}
                rows={4}
                className="w-full border border-divider bg-bg-elev-2 text-fg font-mono text-[10px] rounded-md p-2.5 resize-none focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Import Column */}
        <div className="flex flex-col gap-4 border-t md:border-t-0 md:border-l border-divider/60 pt-6 md:pt-0 md:pl-6">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-brand shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">
              Import API Keys
            </h3>
          </div>
          <p className="text-[11px] text-fg-subtle leading-relaxed">
            Paste a previously exported backup payload and supply the password you used during export to
            restore your keys.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="import-payload" className="text-[10px] font-bold text-fg-subtle uppercase">
                Backup Payload
              </label>
              <textarea
                id="import-payload"
                placeholder="Paste backup payload here..."
                value={importPayload}
                onChange={(e) => setImportPayload(e.target.value)}
                rows={3}
                className="w-full border border-divider bg-bg-elev-2 text-fg font-mono text-[10px] rounded-md p-2.5 resize-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="import-pwd" className="text-[10px] font-bold text-fg-subtle uppercase">
                Decryption Password
              </label>
              <Input
                id="import-pwd"
                type="password"
                placeholder="Enter backup password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                className="text-xs"
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={isImportPending || !importPayload || !importPassword}
              loading={isImportPending}
              className="w-full sm:w-auto self-start mt-1"
            >
              {isImportPending ? 'Importing…' : 'Decrypt & Restore Keys'}
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
