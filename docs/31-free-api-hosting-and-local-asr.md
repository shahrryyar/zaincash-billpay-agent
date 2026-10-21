# Free API, hosting and publishing options — checked 2026-10-21

Hosting research requested for later. Google AI Studio is now configured locally; no hosting account, public tunnel, deployment or access-control change was created.

## LLM API

| Option | Where to obtain access | How this repo uses it | Agent control |
|---|---|---|---|
| Groq Free | [Groq console](https://console.groq.com/keys); choose an available tool-capable model and inspect the actual organisation quota | LLM_PROVIDER=groq, GROQ_API_KEY, GROQ_MODEL | Existing OpenAI-compatible adapter and normal HTTP/SDK calls; no provider-specific MCP is necessary to call the model |
| Gemini free tier | [Google AI Studio](https://aistudio.google.com/apikey); free availability varies by model/project | LLM_PROVIDER=gemini, GEMINI_API_KEY, GEMINI_MODEL | Existing adapter and API calls; choose the exact model ID in AI Studio |

Groq's [billing FAQ](https://console.groq.com/docs/billing-faqs) distinguishes its Free and paid Developer tiers. Its [rate-limit page](https://console.groq.com/docs/rate-limits) lists model-specific limits, so do not assume every model has 30 requests/minute. Gemini's [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits) are the references for eligible free models and active project limits. Do not copy old fixed daily numbers from the organiser pack as current guarantees. Google AI Studio was authenticated and Gemini 3.5 Flash-Lite completed a real tool-assisted transfer check. A burst of checks hit this project/model’s actual 15-request/minute free quota; subsequent runs use process-local pacing. Current results and limitations are in docs/30. Groq has no configured key and remains unmeasured. Synthetic prompts only; review the selected provider's data terms before use.

Create the key in the provider account, store it only in local/server secrets, then run `pnpm smoke` and the development evaluation with that exact provider/model. The model must support the app's tool-call contract; “free” alone is not a quality result. The author removed the Claude key; Gemini is the current local provider. Historical Claude results remain historical. Set LLM_REQUEST_INTERVAL_MS=5000 for this 15 RPM quota and run dev checks sequentially. This only spaces requests within a process: CLI, web and other apps still share the same upstream project quota.

## Hosting the web app

**Render Free is the existing repo-compatible starting point.** It accepts Docker web services and supplies an onrender.com URL; this repo already has Dockerfile and render.yaml. Free services sleep after 15 idle minutes and use ephemeral storage. Those limits matter because this demo's in-memory sandboxes and schedules vanish on restart. Open the demo before presenting and keep a laptop backup. [Render free services](https://render.com/docs/free), [Docker web services](https://render.com/docs/web-services).

Render supplies an official [CLI](https://render.com/docs/cli) and [MCP server](https://render.com/docs/mcp-server). Their documented capabilities include service creation/deployment and inspecting logs; the MCP supports environment changes too. After account authorisation, an agent can operate the supported commands. Render CLI 2.30.0 is now installed locally at .cache/hosting-tools/render (official release ZIP and SHA256 verified; telemetry disabled for checks). The MCP connector is not connected. GitHub CLI and Docker are available. Blueprint validation was attempted with the real CLI but stopped with “no workspace specified and no default workspace set”. Account/workspace authorisation is still needed; a public repo alone is not platform authentication. After selecting the authorised workspace, run `.cache/hosting-tools/render blueprints validate render.yaml --output json`, then deploy from that reviewed configuration.

GitHub is the source/evidence publication path here, already reachable through authenticated `gh`/git. A static-only site host cannot run this Next.js/Hono/native-SQLite/ASR server unchanged. Render can host the web image; do not assume its free instance can load the large NeMo checkpoint.

## Can the laptop's ASR serve a hosted app?

Yes, if a reachable route forwards to the laptop's ASR server. A remote host's `127.0.0.1` points to itself, not this laptop. Keep Stage-11 on CPU here; expose it through an authenticated HTTPS endpoint/tunnel only when publishing is authorised. The web server keeps the separate local ASR key in its own secret store; the browser never receives that key.

Two layouts are possible:

1. **Whole demo on the laptop:** production web app and ASR stay local; a tunnel publishes only the web app. Its server still calls ASR at 127.0.0.1:8790. This keeps the ASR endpoint off the public Internet and avoids a separate cloud web server.
2. **Render web + laptop ASR:** a tunnel publishes the ASR HTTP service. Render uses REGALABS_BASE_URL=https://YOUR-ASR-HOST/v1 and the local key in Render secrets. This adds dependence on the laptop, its Internet connection, the tunnel and the model process.

Cloudflare [Tunnel](https://developers.cloudflare.com/tunnel/get-started/) maps a public hostname to a local service and is controlled with the cloudflared CLI or its API. A normal stable published hostname needs an account and a domain on Cloudflare. [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) provide a temporary trycloudflare.com URL without an account/domain, for testing. They have no uptime guarantee, a changing hostname, a 200 in-flight request limit and no SSE support. Temporary email authentication is interactive, so it is not a substitute for machine-to-machine ASR authentication.

The CLI examples, for a future authorised setup, are `cloudflared tunnel --url http://localhost:3000` for the web app, or port 8790 for the ASR service. They publish a service; do not run them casually. Prefer a production web build for a public demo rather than exposing the Next development server. cloudflared is not installed here. It can be installed and controlled later; a Cloudflare MCP connector is optional, not required to run the local tunnel process.

The laptop must remain awake, powered, connected and running the model. Model warm-up is about 70–85 seconds in observed startup logs; per-utterance latency is a different measurement. The local service disappeared once during testing and was restarted, demonstrating why this is a demo dependency rather than cloud uptime. The ASR server serialises inference; test concurrent judges and longer utterances before promising service capacity.

For phone microphone use, an HTTPS public URL also provides the secure browser context required by normal microphone permission policies. LAN HTTP text testing and microphone access are separate concerns. Phone IP allowlisting was cancelled by the author; no access-rule change was made.
