// SPDX-License-Identifier: Apache-2.0

// Shared divider — flush with card edges so it stretches -mx-4 inside a
// p-4 card. Use this everywhere in settings; don't use inline <hr>.

export function RowDivider() {
  return <div className="border-border -mx-4 my-1 border-t" />;
}
