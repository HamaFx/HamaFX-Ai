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

import { Bot, Shield, TrendingUp, Newspaper, Brain, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface AgentOpinion { agentName: string; bias: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string; }
interface AgentProgress { agentName: string; status: 'pending' | 'running' | 'done' | 'error'; opinion?: AgentOpinion; error?: string; }
interface AgentDeliberationProps { agents: AgentProgress[]; mode: string; }

const AGENT_META: Record<string, { icon: ReactNode; label: string; color: string }> = {
  technical:   { icon: <TrendingUp className="size-3.5" />, label: 'Technical',   color: 'text-emerald-500' },
  fundamental: { icon: <Newspaper className="size-3.5" />,  label: 'Fundamental', color: 'text-blue-500' },
  risk:        { icon: <Shield className="size-3.5" />,     label: 'Risk',        color: 'text-red-500' },
  sentiment:   { icon: <Bot className="size-3.5" />,        label: 'Sentiment',   color: 'text-amber-500' },
  decision:    { icon: <Brain className="size-3.5" />,      label: 'Decision',    color: 'text-purple-500' },
};

export function AgentDeliberation({ agents, mode }: AgentDeliberationProps) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Brain className="size-3.5" />
        <span className="uppercase tracking-wider font-semibold">Multi-Agent {mode} mode</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {agents.map((a) => {
          const meta = AGENT_META[a.agentName] ?? { icon: <Bot className="size-3.5" />, label: a.agentName, color: 'text-gray-500' };
          return (
            <div key={a.agentName} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {meta.icon}
              <span className={meta.color}>{meta.label}</span>
              {a.status === 'pending' && <span className="text-gray-400 dark:text-gray-600">·</span>}
              {a.status === 'running' && <Loader2 className="size-3 animate-spin text-gray-400" />}
              {a.status === 'done' && <CheckCircle2 className="size-3 text-emerald-500" />}
              {a.status === 'error' && <AlertCircle className="size-3 text-red-500" />}
            </div>
          );
        })}
      </div>
      {agents.some((a) => a.opinion) && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">View agent opinions</summary>
          <div className="mt-2 flex flex-col gap-2">
            {agents.filter((a) => a.opinion).map((a) => {
              const meta = AGENT_META[a.agentName] ?? { label: a.agentName, color: 'text-gray-500' };
              return (
                <div key={a.agentName} className="text-xs border-l-2 border-gray-300 dark:border-gray-700 pl-2">
                  <span className="font-semibold">{meta.label}: </span>
                  <span className="text-gray-600 dark:text-gray-400">{a.opinion!.reasoning}</span>
                  <span className="ml-1 text-gray-400 dark:text-gray-600">({a.opinion!.bias}, {Math.round(a.opinion!.confidence * 100)}%)</span>
                </div>
              );
            })}
          </div>
        </details>
      )}
      {agents.filter((a) => a.status === 'error' && a.error).map((a) => (
        <div key={`error-${a.agentName}`} className="text-xs text-red-500">{AGENT_META[a.agentName]?.label ?? a.agentName} agent failed: {a.error}</div>
      ))}
    </div>
  );
}