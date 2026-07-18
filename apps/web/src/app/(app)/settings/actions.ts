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

// Settings server actions — re-export barrel.
// All action implementations live in domain-specific files under _actions-*.ts.
// Import paths remain unchanged: `from '../actions'` still works everywhere.

export type { ActionResult, SaveKeysResult } from './_actions-shared';

// Security
export {
  setupTwoFactorAction,
  verifyTwoFactorAction,
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
