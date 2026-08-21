// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import {
  IconCheck,
  IconCheckbox,
  IconFlame,
  IconHeartbeat,
  IconListCheck,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/cn';

interface SessionPlan {
  date: string;
  maxDailyR: number;
  mindset: string;
  primaryRule: string;
  newsReviewed: boolean;
  strategyAligned: boolean;
  completedAt: number;
}

const STORAGE_KEY_PREFIX = 'kestrel:session-gameplan:';

function getTodayKey(): string {
  const d = new Date();
  return `${STORAGE_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MINDSET_OPTIONS = [
  { id: 'calm', label: 'Calm & Patient', icon: '🧘', desc: 'Ready to wait for A+ setups' },
  { id: 'focused', label: 'Sharp & Focused', icon: '🎯', desc: '100% focused on execution' },
  { id: 'neutral', label: 'Neutral & Objective', icon: '⚖️', desc: 'Unbiased market observation' },
  { id: 'fatigued', label: 'Tired / Distracted', icon: '⚠️', desc: 'Recommend half-risk only' },
];

const PRESET_RULES = [
  'Wait for 15m candle close confirmation before entering',
  'Strict 1:2 minimum Risk-to-Reward on every execution',
  'Zero trading during high-impact news releases',
  'Max 2 trades per session — quality over quantity',
  'Take profits at key liquidity levels; do not be greedy',
];

export function PreSessionChecklistDrawer() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  // Form states
  const [newsReviewed, setNewsReviewed] = useState(false);
  const [strategyAligned, setStrategyAligned] = useState(false);
  const [maxDailyR, setMaxDailyR] = useState(2.0);
  const [mindset, setMindset] = useState('focused');
  const [primaryRule, setPrimaryRule] = useState<string>(PRESET_RULES[0] ?? 'Strict 1:2 minimum Risk-to-Reward on every execution');
  const [customRule, setCustomRule] = useState('');

  // Load today's plan on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) {
        const parsed = JSON.parse(raw) as SessionPlan;
        setPlan(parsed);
        setNewsReviewed(parsed.newsReviewed);
        setStrategyAligned(parsed.strategyAligned);
        setMaxDailyR(parsed.maxDailyR);
        setMindset(parsed.mindset);
        setPrimaryRule(parsed.primaryRule || PRESET_RULES[0] || '');
      }
    } catch {
      // ignore
    }
  }, []);

  function handleSavePlan() {
    if (!newsReviewed || !strategyAligned) {
      toast.error('Please acknowledge the news clearance and strategy commitment checks.');
      return;
    }

    const newPlan: SessionPlan = {
      date: new Date().toISOString().slice(0, 10),
      maxDailyR,
      mindset,
      primaryRule: customRule.trim() || primaryRule || (PRESET_RULES[0] ?? 'Strict Risk Management'),
      newsReviewed,
      strategyAligned,
      completedAt: Date.now(),
    };

    try {
      localStorage.setItem(getTodayKey(), JSON.stringify(newPlan));
      setPlan(newPlan);
      setOpen(false);
      toast.success('Pre-session gameplan locked in! Trade with discipline today.', {
        icon: '🛡️',
      });
    } catch {
      toast.error('Failed to save session plan.');
    }
  }

  const isCompleted = !!plan;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold transition-all border',
            isCompleted
              ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'
              : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-border-hover',
          )}
          title={isCompleted ? 'Session Gameplan is Active' : 'Start Pre-Session Checklist'}
        >
          {isCompleted ? (
            <>
              <IconShieldCheck className="size-3.5 text-brand" />
              <span>Gameplan: {plan.maxDailyR}R Max</span>
            </>
          ) : (
            <>
              <IconListCheck className="size-3.5 text-fg-subtle" />
              <span>Pre-Session Checklist</span>
            </>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[92vh] overflow-y-auto">
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-sm bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
              <IconListCheck className="size-5" />
            </div>
            <div>
              <DrawerTitle>Pre-Session Gameplan & Discipline Ritual</DrawerTitle>
              <DrawerDescription>
                Lock in your session parameters before touching the charts to prevent FOMO and emotional overtrading.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex flex-col gap-5 px-4 pb-6 max-w-2xl mx-auto w-full">
          {/* Step 1: Mindset Check */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
              <IconHeartbeat className="size-3.5 text-brand" />
              1. Emotional & Psychological State
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MINDSET_OPTIONS.map((opt) => {
                const active = mindset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMindset(opt.id)}
                    className={cn(
                      'flex flex-col items-start gap-1 p-2.5 rounded-sm border text-left transition-all',
                      active
                        ? 'border-brand bg-brand/10 text-fg ring-1 ring-brand'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-border-hover',
                    )}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-fg-subtle leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Risk Budget */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                <IconShieldCheck className="size-3.5 text-danger" />
                2. Max Daily Drawdown Budget
              </span>
              <span className="text-xs font-mono font-bold text-danger">
                -{maxDailyR.toFixed(1)}R Hard Stop
              </span>
            </div>
            <p className="text-xs text-fg-subtle">
              If cumulative realized losses reach this limit today, stop trading immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              {[1.0, 1.5, 2.0, 2.5, 3.0].map((r) => {
                const active = maxDailyR === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setMaxDailyR(r)}
                    className={cn(
                      'px-3 py-1.5 rounded-sm text-xs font-semibold font-mono border transition-all',
                      active
                        ? 'border-danger bg-danger/15 text-danger font-bold ring-1 ring-danger'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
                    )}
                  >
                    {r.toFixed(1)}R Max
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Rule of the Session */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
              <IconSparkles className="size-3.5 text-warn" />
              3. Session Execution Focus Rule
            </span>
            <div className="flex flex-col gap-1.5">
              {PRESET_RULES.map((rule) => {
                const active = primaryRule === rule && !customRule;
                return (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => {
                      setPrimaryRule(rule);
                      setCustomRule('');
                    }}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-sm border text-left text-xs transition-all',
                      active
                        ? 'border-brand bg-brand/10 text-fg font-medium ring-1 ring-brand'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
                    )}
                  >
                    <div className={cn(
                      'size-3.5 rounded-full border flex items-center justify-center shrink-0',
                      active ? 'border-brand bg-brand text-bg' : 'border-border',
                    )}>
                      {active && <IconCheck className="size-2.5 stroke-[3]" />}
                    </div>
                    <span>{rule}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 4: Mandatory Acknowledgements */}
          <div className="flex flex-col gap-2 rounded-sm border border-border/80 bg-bg-elev-1 p-3">
            <span className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">
              4. Session Protocol Verification
            </span>
            
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-fg">
              <input
                type="checkbox"
                checked={newsReviewed}
                onChange={(e) => setNewsReviewed(e.target.checked)}
                className="mt-0.5 size-4 rounded-xs border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand cursor-pointer"
              />
              <span>
                <strong>Economic Calendar Checked</strong>: I have reviewed today's high-impact releases and will not enter reckless market orders before high-volatility events.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-fg">
              <input
                type="checkbox"
                checked={strategyAligned}
                onChange={(e) => setStrategyAligned(e.target.checked)}
                className="mt-0.5 size-4 rounded-xs border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand cursor-pointer"
              />
              <span>
                <strong>Discipline Commitment</strong>: I will honor my stop losses, never revenge-trade, and shut down terminal if my {maxDailyR}R max drawdown is reached.
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <DrawerClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              variant="primary"
              size="md"
              onClick={handleSavePlan}
              className="gap-2 font-semibold"
            >
              <IconShieldCheck className="size-4" />
              Lock In Gameplan
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
