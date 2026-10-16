// Never return Google's raw error message: it can echo request details.
export function geminiError(status: number, reason?: string): string {
  let action: string;
  if (reason === 'API_KEY_INVALID' || status === 401) action = 'Google rejected the API key. Create a valid replacement in Google AI Studio, update GEMINI_API_KEY in .env.local and restart.';
  else if (reason === 'API_KEY_SERVICE_BLOCKED' || reason === 'API_KEY_HTTP_REFERRER_BLOCKED' || status === 403) action = 'Google denied access. Check the key restrictions, whether the Gemini API is enabled, and your project access in Google AI Studio.';
  else if (status === 404) action = 'The configured Gemini model is unavailable for this key. Run npm run gemini:check to list accessible models, update GEMINI_MODEL in .env.local and restart.';
  else if (status === 429) action = 'Google reported a quota or rate limit. Check your project quota and billing in Google AI Studio, or wait before retrying.';
  else if (status === 400) action = 'Google rejected the request configuration. Check your key, model access and project requirements with npm run gemini:check.';
  else if (status >= 500) action = 'Google Gemini is temporarily unavailable. Try again later.';
  else action = 'Google could not complete this request. Check your Gemini project configuration.';
  return `Gemini HTTP ${status}: ${action} Local explanations are unchanged.`;
}
