import { defineProject, type UserWorkspaceConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

interface ProjectOptions {
  name: string;
  environment?: 'node' | 'jsdom';
  include?: string[];
  setupFiles?: string[];
  coverage?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
}

export function createProjectConfig(opts: ProjectOptions): UserWorkspaceConfig {
  const { name, environment = 'node', include = ['test/**/*.test.ts'], setupFiles = [], coverage } = opts;

  return defineProject({
    test: {
      name,
      environment,
      include: [...include, 'src/**/*.test.ts'],
      setupFiles: [
        ...setupFiles,
      ],
      server: {
        deps: {
          inline: ['server-only'],
        },
      },
      alias: {
        'server-only': fileURLToPath(
          new URL('../mocks/server-only.ts', import.meta.url),
        ),
      },
    },
    ...(coverage
      ? {
          coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/index.ts'],
            thresholds: {
              statements: coverage.statements ?? 50,
              branches: coverage.branches ?? 40,
              functions: coverage.functions ?? 50,
              lines: coverage.lines ?? 50,
            },
          },
        }
      : {}),
  } as UserWorkspaceConfig);
}
