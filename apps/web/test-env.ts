import { getServerEnv } from './src/lib/env';
import { resolveDatabaseUrl } from '@hamafx/shared';
try {
  const env = getServerEnv();
  console.log('SUCCESS! ENV is valid.');
} catch (e) {
  console.error('ERROR VALIDATING ENV:', e.message);
}
