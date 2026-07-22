// SPDX-License-Identifier: Apache-2.0

// Settings server actions — re-export barrel.
// All action implementations live in domain-specific files under _actions-*.ts.
// Import paths remain unchanged: `from '../actions'` still works everywhere.

export type { ActionResult, SaveKeysResult } from './_actions-shared';

// Security
export {
  setupTwoFactorAction,
  verifyTwoFactorAction,
  regenerateBackupCodesAction,
  disableTwoFactorAction,
  listSessionsAction,
  revokeSessionAction,
  signOutEverywhereAction,
  changePasswordAction,
  deleteAccountAction,
} from './_actions-security';

// API keys
export {
  updateApiKeysAction,
  exportKeysAction,
  importKeysAction,
  updateMarketDataProviderAction,
} from './_actions-api-keys';

// Preferences
export {
  updateProfileAction,
  updateUIPrefsAction,
  updateAiPrefsAction,
  updateDisabledToolsAction,
  updateNotificationPrefsAction,
  updateUsageSettingsAction,
  addSymbolAction,
  removeSymbolAction,
  updateLocaleAction,
} from './_actions-preferences';

// Data
export {
  clearChatHistoryAction,
  exportDataAction,
} from './_actions-data';
