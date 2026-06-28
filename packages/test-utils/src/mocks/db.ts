export interface TestDbHandle {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  exec: (sql: string) => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDbHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();

  return {
    async query(sql: string, params?: unknown[]) {
      const result = await pg.query(sql, params);
      return { rows: (result as unknown as { rows: Record<string, unknown>[] }).rows ?? [] };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async close() {
      await pg.close();
    },
  };
}
