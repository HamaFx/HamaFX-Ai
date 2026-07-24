// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconSearch, IconUsers, IconDownload } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { formatAbsoluteTime, downloadCSV } from '@/lib/format-number';
import type { UserSummary } from '@/lib/services/admin-dtos';

const PAGE_SIZES = [10, 25, 50];

interface SortState {
  key: 'email' | 'role' | 'createdAt';
  order: 'asc' | 'desc';
}

const ROLE_TONE: Record<string, BadgeTone> = {
  admin: 'brand',
  user: 'neutral',
};

export function AdminUserTable() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', order: 'desc' });
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmEl, confirm] = useConfirm();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      if (debouncedQ) params.set('q', debouncedQ);

      const data = await apiFetch<{ users: UserSummary[]; total: number }>(
        `/api/admin/users?${params.toString()}`,
      );
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = useCallback(
    async (user: UserSummary, newRole: 'admin' | 'user') => {
      const isPromote = newRole === 'admin';
      const confirmed = await confirm({
        title: isPromote ? 'Promote to admin?' : 'Demote to user?',
        description: `This will change ${user.email}'s role to ${newRole}.`,
        confirmLabel: isPromote ? 'Promote' : 'Demote',
        tone: isPromote ? 'default' : 'danger',
      });
      if (!confirmed) return;

      setPendingUserId(user.id);
      try {
        await apiMutate(`/api/admin/users/${user.id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        });
        toast.success(`${isPromote ? 'Promoted' : 'Demoted'} ${user.email}`);
        await fetchUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update role';
        toast.error(msg);
      } finally {
        setPendingUserId((current) => (current === user.id ? null : current));
      }
    },
    [confirm, fetchUsers],
  );

  const handleSort = useCallback((key: SortState['key']) => {
    setSort((prev) =>
      prev.key === key ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' },
    );
  }, []);

  const sortedUsers = [...users].sort((a, b) => {
    const { key, order } = sort;
    const dir = order === 'asc' ? 1 : -1;
    if (key === 'email') return (a.email ?? '').localeCompare(b.email ?? '') * dir;
    if (key === 'role') return a.role.localeCompare(b.role) * dir;
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
  });

  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const headerCell = (key: SortState['key'], label: string) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="flex items-center gap-1 text-left font-medium hover:text-fg"
    >
      {label}
      {sort.key === key && <span className="text-fg-subtle">{sort.order === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  function handleExport() {
    downloadCSV(
      sortedUsers.map((u) => ({
        email: u.email,
        name: u.name ?? '',
        role: u.role,
        onboardingCompleted: u.onboardingCompleted ? 'Done' : 'Pending',
        createdAt: u.createdAt,
      })),
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Users" description="Registered users.">
        <AdminErrorBlock message={fetchError} onRetry={fetchUsers} />
      </SettingsSection>
    );
  }

  const description = `Total: ${total}${total > 0 ? ` • ${start}-${end}` : ''}`;

  return (
    <>
      <SettingsSection title="Users" description={description}>
        <div className="flex items-center justify-end gap-2 pb-3">
          <Button variant="secondary" size="sm" onClick={fetchUsers}>
            Refresh
          </Button>
          {users.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <IconDownload className="size-4" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <IconSearch className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search by email or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="page-size" className="text-sm text-fg-subtle">
              Show
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-bg-elev-1 border-border text-fg rounded-sm border px-2 py-1 text-sm"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-border overflow-x-auto rounded-sm border">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-bg-elev-2 text-fg-subtle">
              <tr>
                <th className="px-4 py-2">{headerCell('email', 'Email')}</th>
                <th className="px-4 py-2">{headerCell('role', 'Role')}</th>
                <th className="px-4 py-2">Onboarding</th>
                <th className="px-4 py-2">{headerCell('createdAt', 'Created')}</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <EmptyState
                      icon={<IconUsers className="size-6" />}
                      title="No users found"
                      description="Registered users will appear here."
                      bare
                    />
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr key={user.id} className="border-border border-t">
                    <td className="text-fg px-4 py-2">
                      <div className="flex flex-col">
                        <span>{user.email}</span>
                        {user.name && <span className="text-fg-subtle text-xs">{user.name}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={ROLE_TONE[user.role] ?? 'neutral'}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={user.onboardingCompleted ? 'success' : 'warn'}>
                        {user.onboardingCompleted ? 'Done' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="text-fg-subtle px-4 py-2" title={formatAbsoluteTime(user.createdAt)}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {user.role === 'admin' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={pendingUserId === user.id}
                          onClick={() => handleRoleChange(user, 'user')}
                        >
                          {pendingUserId === user.id ? 'Demoting…' : 'Demote'}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={pendingUserId === user.id}
                          onClick={() => handleRoleChange(user, 'admin')}
                        >
                          {pendingUserId === user.id ? 'Promoting…' : 'Promote'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > pageSize && (
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-fg-subtle">
              Page {page + 1} of {Math.ceil(total / pageSize)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={(page + 1) * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </SettingsSection>
      {confirmEl}
    </>
  );
}
