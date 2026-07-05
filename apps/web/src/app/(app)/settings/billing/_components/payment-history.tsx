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

interface Payment {
  id: string;
  nowpaymentsPaymentId: string;
  status: string;
  payAmount: string | null;
  payCurrency: string | null;
  usdAmountCents: number | null;
  txHash: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: 'text-warn',
  confirming: 'text-info',
  confirmed: 'text-info',
  sending: 'text-info',
  finished: 'text-bull',
  failed: 'text-bear',
  expired: 'text-fg-subtle',
  refunded: 'text-info',
};

export function PaymentHistory({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-fg text-sm font-semibold">Payment History</h3>
        <p className="text-fg-subtle text-sm">No payments yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-fg text-sm font-semibold">Payment History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-fg-subtle">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Amount</th>
              <th className="pb-2 pr-4 font-medium">Currency</th>
              <th className="pb-2 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const date = new Date(payment.createdAt);
              const statusColor = STATUS_COLORS[payment.status] ?? 'text-fg-subtle';
              return (
                <tr key={payment.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-fg">
                    {date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className={`py-2 pr-4 capitalize ${statusColor}`}>
                    {payment.status}
                  </td>
                  <td className="py-2 pr-4 text-fg">
                    {payment.payAmount ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-fg uppercase">
                    {payment.payCurrency ?? '—'}
                  </td>
                  <td className="py-2 text-fg-subtle font-mono text-xs">
                    {payment.txHash ? `${payment.txHash.slice(0, 12)}…` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
