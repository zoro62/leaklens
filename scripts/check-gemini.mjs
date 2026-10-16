import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const key = process.env.GEMINI_API_KEY?.trim();
if (!key) { console.error('Missing GEMINI_API_KEY in .env.local.'); process.exitCode = 1; }
else {
  try {
    // Lists public model metadata only. No screenshot or paid generation request.
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    console.log(`Google HTTP status: ${response.status}`);
    if (!response.ok) {
      const reasons = new Set(['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED']);
      for (const detail of data.error?.details || []) if (reasons.has(detail.reason)) console.log(`Configuration issue: ${detail.reason}`);
      console.log('Check the key, project access, API restrictions and quota in Google AI Studio. The key and raw provider error are intentionally hidden.');
      process.exitCode = 1;
    } else {
      const models = data.models?.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace(/^models\//, '')) || [];
      const configured = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      console.log(`Configured model available: ${models.includes(configured) ? 'yes' : 'no (check the model list below)'}`);
      console.log('Available generation models:'); models.forEach(model => console.log(model));
      if (data.nextPageToken) console.log('More models exist beyond this first page.');
      console.log('Model listing confirms authentication only; it does not verify generation quota or structured output.');
    }
  } catch { console.error('Cannot reach Google Gemini. Check your connection, proxy or firewall. No key was printed.'); process.exitCode = 1; }
}
