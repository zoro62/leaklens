# Optional Gemini review coach

The deterministic screenshot workflow works without configuration. Gemini only ranks fixed review advice; it does not write new findings, edit coordinates, select regions or declare an image safe.

1. Open `.env.local` in the project root (an ignored template is provided).
2. Set `GEMINI_API_KEY=your_key_here` and `GEMINI_ENABLED=true`. Keep the actual key out of chat, Git and screenshots. Obtain a key from [Google AI Studio](https://aistudio.google.com/api-keys).
3. Restart the server. For production, run `npm run build` then `npm start`. For development, run `npm run dev`.
4. Open `http://127.0.0.1:3000`, analyse a demo, and open Gemini review coach in the findings panel. Inspect the exact summary, give consent and click Prioritise review with Gemini.

The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can select a compatible available Gemini model. Model availability and billing depend on your Google account. The route uses Google's [structured output REST API](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). No extra SDK is needed.

If Google rejects a request, run `npm run gemini:check` in your own terminal. It checks authentication and lists available generation models without sending screenshot data or making a generation request. It never prints the key or raw provider error. A successful listing does not establish generation quota. The UI separately identifies provider HTTP errors for invalid keys, access restrictions, unavailable models and quota limits. After changing server code, run `npm run build` before restarting `npm start`.

Only category counts, deterministic relationship rule IDs and a scan-incomplete boolean are transmitted to Google through the local server. Image bytes, OCR text, QR payloads, names, emails, addresses, credentials, finding IDs and bounding boxes are excluded. The UI shows the complete payload before consent. This summary still reveals types of exposure; Google's applicable service data terms govern its processing. There is no background AI request or persistence.

The server key is never returned to the browser. The endpoint is disabled unless explicitly enabled and configured. It requires a directly connected loopback server and same-origin request, rejects nonlocal forwarding headers, validates a maximum 4 KB strict JSON input, allows one provider request at a time and ten per rolling hour per server process, and times out after 20 seconds. Output must be an exact permutation of applicable advice IDs. Errors preserve the local analysis. Clearing or changing the scan cancels/invalidate the UI request; a request already received by Google may still be billed.

Keep this feature local. Do not enable it on public hosting. Loopback checks and in-memory quotas are not authentication, shared rate limiting or a deployment spending cap. Public deployment requires authenticated access, shared quotas and provider budget controls. Proxies are deliberately unsupported. Restarting the process resets its quota.

Automated tests use a mocked provider response to test this contract; they are not live Gemini evaluation. A real key and a successful explicit request are needed to verify your account/model connectivity. Missing configuration, API errors, blocked responses, timeouts and invalid output produce a visible fallback message, never fabricated AI advice.
