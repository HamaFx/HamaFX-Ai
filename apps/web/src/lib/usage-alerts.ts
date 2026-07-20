import 'server-only';

import { getUserWithSettings, listAllUserSettings } from '@hamafx/db';
import {
  getMonthlySpend,
  getProviderMonthlySpend,
  sendDirectNotification,
} from '@hamafx/ai';

interface UsageAlertResult {
  alertsSent: number;
  checkedUsers: number;
}

const sentAlerts = new Set<string>();

export function resetSentAlerts() {
  sentAlerts.clear();
}

export async function checkAllUsageAlerts(): Promise<UsageAlertResult> {
  const allSettings = await listAllUserSettings();

  let alertsSent = 0;
  let checkedUsers = 0;

  for (const settings of allSettings) {
    const limit = settings.monthlyBudgetLimit;
    const thresholds = settings.providerSpendingThresholds;
    const alertsConfig = settings.spendAlertsConfig;

    if (!limit && (!thresholds || Object.keys(thresholds).length === 0)) {
      continue;
    }

    if (!alertsConfig || (!alertsConfig.email && !alertsConfig.telegram)) {
      continue;
    }

    checkedUsers++;

    const { settings: fullSettings, user: userRow } = await getUserWithSettings(settings.userId);

    const alertEmail = fullSettings?.alertEmail || userRow?.email;
    const telegramBotToken = fullSettings?.telegramBotToken;
    const telegramChatId = fullSettings?.telegramChatId;

    const channels: ('email' | 'telegram')[] = [];
    if (alertsConfig.email && alertEmail) channels.push('email');
    if (alertsConfig.telegram && telegramBotToken && telegramChatId) channels.push('telegram');

    if (channels.length === 0) continue;

    const dedupPrefix = `monthly:${settings.userId}:`;
    const provDedupPrefix = `provider:${settings.userId}:`;

    const env: Parameters<typeof sendDirectNotification>[2] = {};
    if (process.env.RESEND_API_KEY) env.RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (process.env.ALERT_FROM_EMAIL) env.ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
    if (alertEmail) env.ALERT_TO_EMAIL = alertEmail;
    if (telegramBotToken) env.TELEGRAM_BOT_TOKEN = telegramBotToken;
    if (telegramChatId) env.TELEGRAM_CHAT_ID = telegramChatId;

    // Check monthly budget thresholds
    if (limit && limit > 0) {
      const monthlySpend = await getMonthlySpend(settings.userId);

      if (monthlySpend >= limit) {
        const key = `${dedupPrefix}100`;
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendDirectNotification(
            '[HamaFX-Ai] Monthly Budget Alert: 100% Reached',
            `Your monthly AI spend has reached 100% of your limit.\n\nSpent: $${monthlySpend.toFixed(2)} / $${limit.toFixed(2)}\n\n— HamaFX-Ai`,
            env,
            channels,
          );
          alertsSent++;
        }
      } else if (monthlySpend >= limit * 0.8) {
        const key = `${dedupPrefix}80`;
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendDirectNotification(
            '[HamaFX-Ai] Monthly Budget Alert: 80% Reached',
            `Your monthly AI spend has reached 80% of your limit.\n\nSpent: $${monthlySpend.toFixed(2)} / $${limit.toFixed(2)}\n\n— HamaFX-Ai`,
            env,
            channels,
          );
          alertsSent++;
        }
      } else if (monthlySpend >= limit * 0.5) {
        const key = `${dedupPrefix}50`;
        if (!sentAlerts.has(key)) {
          sentAlerts.add(key);
          await sendDirectNotification(
            '[HamaFX-Ai] Monthly Budget Alert: 50% Reached',
            `Your monthly AI spend has reached 50% of your limit.\n\nSpent: $${monthlySpend.toFixed(2)} / $${limit.toFixed(2)}\n\n— HamaFX-Ai`,
            env,
            channels,
          );
          alertsSent++;
        }
      }
    }

    // Check per-provider thresholds
    if (thresholds) {
      for (const [providerId, threshold] of Object.entries(thresholds)) {
        if (threshold && threshold > 0) {
          const providerSpend = await getProviderMonthlySpend(settings.userId, providerId);
          if (providerSpend >= threshold) {
            const key = `${provDedupPrefix}${providerId}:${threshold}`;
            if (!sentAlerts.has(key)) {
              sentAlerts.add(key);
              await sendDirectNotification(
                `[HamaFX-Ai] Provider Threshold Alert: ${providerId}`,
                `Your monthly spend for provider "${providerId}" has exceeded your configured threshold.\n\nSpent: $${providerSpend.toFixed(2)} / $${threshold.toFixed(2)}\n\n— HamaFX-Ai`,
                env,
                channels,
              );
              alertsSent++;
            }
          }
        }
      }
    }
  }

  return { alertsSent, checkedUsers };
}
