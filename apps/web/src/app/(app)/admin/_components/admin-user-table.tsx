// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';

interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  onboardingCompleted: boolean | null;
}

export function AdminUserTable() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<{ users: UserSummary[]; total: number }>(
        '/api/admin/users?limit=50&offset=0',
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
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Users" description="Registered users.">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-danger">{fetchError}</p>
          <Button variant="secondary" size="sm" onClick={fetchUsers}>
            Retry
          </Button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Users" description={`Total: ${total}`}>
      <div className="border-border overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Onboarding</th>
              <th className="px-4 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <EmptyState
                    icon={<IconUsers className="size-6" />}
                    title="No users found"
                    description="Registered users will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        user.role === 'admin'
                          ? 'bg-brand/10 text-brand'
                          : 'bg-bg-elev-2 text-fg-muted',
                      )}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        user.onboardingCompleted
                          ? 'bg-success/10 text-success'
                          : 'bg-warn/10 text-warn',
                      )}
                    >
                      {user.onboardingCompleted ? 'Done' : 'Pending'}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
