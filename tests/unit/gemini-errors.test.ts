import { expect, it } from 'vitest';
import { geminiError } from '../../src/lib/gemini-errors';
it('provides actionable provider errors without echoing untrusted details', () => {
  expect(geminiError(400, 'API_KEY_INVALID')).toContain('rejected the API key');
  expect(geminiError(403)).toContain('denied access');
  expect(geminiError(404)).toContain('model is unavailable');
  expect(geminiError(429)).toContain('quota');
  expect(geminiError(503)).toContain('temporarily unavailable');
  expect(geminiError(400, 'SECRET_DO_NOT_ECHO')).not.toContain('SECRET_DO_NOT_ECHO');
});
