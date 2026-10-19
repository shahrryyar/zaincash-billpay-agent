// Simple 5-slide design brief. Run: node build_brief.js
const pptxgen = require("pptxgenjs");

const OUT = "ShahryarSabir_Topic04_BillPayTransfer.pptx";
const REPO = "github.com/shahrryyar/zaincash-billpay-agent";
const INK = "1F2933", ACCENT = "0F6B73", GRAY = "5B6770", LINE = "C9D3D6", PALE = "EEF2F3";
const FONT = "Calibri", AR = "Arial";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
pres.author = "Shahryar Sabir";
pres.title = "Bill Pay & Transfer Agent: design brief";

pres.defineSlideMaster({
  title: "PLAIN",
  background: { color: "FFFFFF" },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.45, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: INK, fontFace: FONT, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Shahryar Sabir  ·  Topic 04  ·  Design brief  ·  22/10/2026", options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10, color: GRAY, margin: 0, isTextBox: true } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: GRAY },
});

const txt = (s, name, text, o) =>
  s.addText(text, Object.assign({ isTextBox: true, margin: 0, objectName: name, fontFace: FONT, color: INK, valign: "top" }, o));
const bullets = (items, o = {}) =>
  items.map((t, i) => ({ text: t, options: Object.assign({ bullet: { indent: 16 }, paraSpaceAfter: 8, breakLine: i < items.length - 1 }, o) }));
const head = (s, name, t, x, y, w) => txt(s, name, t, { x, y, w, h: 0.4, fontSize: 18, bold: true, color: ACCENT });

// ---------------- 1. Who and why
let s = pres.addSlide({ masterName: "PLAIN" });
s.addText("Bill Pay & Transfer Agent", { placeholder: "title" });
txt(s, "sub", "ZainCash Agentic AI Challenge  ·  Topic 04", { x: 0.6, y: 1.3, w: 12, h: 0.4, fontSize: 16, color: GRAY });

head(s, "h-what", "What it does", 0.6, 2.1, 3.9);
txt(s, "ar", "دز خمسين ألف لأحمد", { x: 0.6, y: 2.55, w: 3.9, h: 0.7, fontSize: 28, bold: true, fontFace: AR, align: "right", rtlMode: true, lang: "ar-IQ" });
txt(s, "en", "“Send 50,000 to Ahmed.”", { x: 0.6, y: 3.25, w: 3.9, h: 0.35, fontSize: 14, color: GRAY });
txt(s, "what", "The agent understands one Iraqi Arabic sentence, asks if anything is unclear (which Ahmed?), shows a confirmation card, then sends exactly once.", { x: 0.6, y: 3.75, w: 3.9, h: 2.2, fontSize: 16 });

head(s, "h-who", "Who it is for", 4.7, 2.1, 3.9);
txt(s, "who", "People who ask family to pay for them, people afraid of sending money to the wrong person, and anyone who pays bills every month (electricity, generator, internet). I will check this in interviews.", { x: 4.7, y: 2.55, w: 3.9, h: 3.4, fontSize: 16 });

head(s, "h-prob", "The problem", 8.8, 2.1, 3.9);
txt(s, "prob", [
  { text: "124 of 500", options: { bold: true, color: ACCENT, fontSize: 24, breakLine: true } },
  { text: "recent ZainCash iOS reviews are 3★ or lower. The complaints: failed or stuck money, “under maintenance”, support that never answers, fees, fraud. None asks for fewer taps.", options: { fontSize: 16 } },
], { x: 8.8, y: 2.55, w: 3.9, h: 3.4 });

txt(s, "principle", "The model understands. Deterministic code moves the money.", { x: 0.6, y: 6.2, w: 12.1, h: 0.5, fontSize: 20, bold: true, color: ACCENT });
s.addNotes("Evidence: the 500 most recent Iraq App Store reviews of ZainCash, keyword-coded (iOS only, self-selected). They do not support a 'too many taps' premise, so we lead with safe, honest, recoverable and test the fewer-steps idea in interviews. Raw data and script are in docs/research.");

// ---------------- 2. How it works
s = pres.addSlide({ masterName: "PLAIN" });
s.addText("How it works", { placeholder: "title" });
const steps = [
  ["1  Input", "Typed or spoken Iraqi Arabic."],
  ["2  Understand", "Claude reads the sentence, looks up contacts and bills (read-only), and proposes a card."],
  ["3  Check", "Code validates, matches real contacts, asks if unclear, issues a one-time confirm token."],
  ["4  Pay", "Mock wallet sends once, even on retry. Shows the result or an honest failure."],
];
const bw = 2.7, gap = 0.43;
steps.forEach((st, i) => {
  const x = 0.6 + i * (bw + gap);
  s.addShape(pres.ShapeType.roundRect, { x, y: 1.6, w: bw, h: 2.3, fill: { color: i === 2 ? PALE : "FFFFFF" }, line: { color: i === 2 ? ACCENT : LINE, width: 1.5 }, rectRadius: 0.08, objectName: "box-" + (i + 1) });
  txt(s, "box-h-" + (i + 1), st[0], { x: x + 0.2, y: 1.75, w: bw - 0.4, h: 0.4, fontSize: 18, bold: true, color: ACCENT });
  txt(s, "box-t-" + (i + 1), st[1], { x: x + 0.2, y: 2.3, w: bw - 0.4, h: 1.5, fontSize: 15 });
  if (i < 3) s.addShape(pres.ShapeType.line, { x: x + bw + 0.05, y: 2.75, w: gap - 0.1, h: 0, line: { color: GRAY, width: 2, endArrowType: "triangle" }, objectName: "arrow-" + (i + 1) });
});
txt(s, "rules-h", "Five rules that never change", { x: 0.6, y: 4.25, w: 12, h: 0.4, fontSize: 18, bold: true, color: ACCENT });
txt(s, "rules", bullets([
  "The model has no payment tool. It reads and proposes only.",
  "Unclear or ambiguous request: it asks. It never guesses.",
  "Nothing moves without the user's tap on the confirmation card (single-use token).",
  "One idempotency key per card, so retries never charge twice.",
  "Any failure ends safely: “nothing was sent”.",
]), { x: 0.6, y: 4.75, w: 12.1, h: 2.1, fontSize: 16 });
s.addNotes("States: parsed, validated, resolved, awaiting confirm, then executed or failed safe. Design basis: PSD2 dynamic linking (the approval is tied to amount and payee), the IETF idempotency-key draft, OWASP LLM06 Excessive Agency. Voice via the RegaLabs ASR is optional and never required for the text path.");

// ---------------- 3. Models, tools, data
s = pres.addSlide({ masterName: "PLAIN" });
s.addText("Models, tools and data", { placeholder: "title" });
const cw = 3.9, step = cw + 0.2 + 0.2;
head(s, "h-models", "Models", 0.6, 1.5, cw);
txt(s, "models", bullets([
  "Claude Haiku 5.5: live understanding (paid, spend-capped)",
  "Claude Sonnet 5.5: hard cases",
  "Groq and Gemini 3 Flash-Lite: free fallbacks and comparison",
  "RegaLabs Iraqi-Arabic ASR: my own existing service, disclosed; voice is optional",
  "Claude Code: AI coding assistant",
]), { x: 0.6, y: 2.0, w: cw, h: 4.7, fontSize: 15 });
head(s, "h-tools", "Tools", 0.6 + step, 1.5, cw);
txt(s, "tools", bullets([
  "TypeScript, Next.js (Arabic, right-to-left UI)",
  "Hono + SQLite: the mock wallet",
  "Zod and a plain state machine, no agent framework",
  "Vitest, fast-check, k6: invariant, property and concurrency tests",
  "promptfoo: compare prompts and models",
]), { x: 0.6 + step, y: 2.0, w: cw, h: 4.7, fontSize: 15 });
head(s, "h-data", "Data (100% synthetic)", 0.6 + 2 * step, 1.5, cw);
txt(s, "data", bullets([
  "An LLM generates the mock wallet from our schema: two Ahmeds, similar names, a down biller, a paid bill",
  "About 300 Iraqi-dialect requests, written by a different model than the primary, then edited and labelled by hand",
  "40% dev, 60% held-out; the held-out file is hash-frozen and never tuned on",
  "Iraqi speakers review a sample",
]), { x: 0.6 + 2 * step, y: 2.0, w: cw, h: 4.7, fontSize: 15 });
s.addNotes("Everything is disclosed in docs/19. Claude is paid; Groq and Gemini free tiers may train on prompts, so only synthetic data is ever sent. The RegaLabs ASR is the author's own service built before the challenge, used as an external API and re-measured on our own voice clips.");

// ---------------- 4. Test plan
s = pres.addSlide({ masterName: "PLAIN" });
s.addText("How we test it", { placeholder: "title" });
head(s, "h-zero", "Must be zero", 0.6, 1.5, 5.4);
["Payments without a valid confirmation", "Double charges under retry", "Payments on requests that should not go through"].forEach((g, i) => {
  const y = 2.0 + i * 0.88;
  txt(s, "zero-" + (i + 1), "0", { x: 0.6, y, w: 0.9, h: 0.8, fontSize: 44, bold: true, color: ACCENT, valign: "middle" });
  txt(s, "zero-t-" + (i + 1), g, { x: 1.55, y, w: 4.4, h: 0.8, fontSize: 16, valign: "middle" });
});
txt(s, "zero-note", "Stress tests: 20 parallel same-key requests × 50 keys, timeouts after commit, tampered and expired tokens.", { x: 0.6, y: 4.7, w: 5.4, h: 0.8, fontSize: 14, color: GRAY });

head(s, "h-aims", "Quality aims (not yet measured)", 6.6, 1.5, 6.1);
const hd = (t) => ({ text: t, options: { bold: true, fill: { color: PALE }, color: INK } });
const rows = [
  [hd("Metric, on the held-out set"), hd("Aim")],
  ["Intent accuracy", "≥ 95%"],
  ["All slots correct (who, what, how much)", "≥ 90%"],
  ["Asks when a request is ambiguous", "≥ 95%"],
  ["End-to-end completion", "≥ 90%"],
  ["Request to confirmation card (median)", "≤ 3 s"],
];
s.addTable(rows, { x: 6.6, y: 2.0, w: 6.1, colW: [4.4, 1.7], rowH: 0.42, fontSize: 14, color: INK, fontFace: FONT, border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.04, 0.1, 0.04, 0.1], valign: "middle", objectName: "aims-table" });
txt(s, "how-h", "How we stay honest", { x: 0.6, y: 5.75, w: 12, h: 0.35, fontSize: 18, bold: true, color: ACCENT });
txt(s, "how", "150+ held-out requests (ambiguous, malformed and must-not-go-through included), 95% confidence intervals, a second Iraqi labeller, 3–5 user tests and a red-team session. Real numbers only.", { x: 0.6, y: 6.15, w: 12.1, h: 0.75, fontSize: 15 });
s.addNotes("Targets are our own aims, not organiser requirements; the results table will only contain measured numbers. Held-out is hash-committed before prompt work and labelled by hand. With 0 failures in 180 cases the honest claim is an upper bound of about 1.7% at 95% confidence, not 'proven zero'. Details in docs/12 and docs/26.");

// ---------------- 5. Risks and plan
s = pres.addSlide({ masterName: "PLAIN" });
s.addText("Risks and plan", { placeholder: "title" });
head(s, "h-risk", "Main risks", 0.6, 1.4, 7.5);
const rh = (t) => ({ text: t, options: { bold: true, fill: { color: PALE }, color: INK } });
const rb = (t) => ({ text: t, options: { bold: true } });
const risks = [
  [rh("Risk"), rh("What we do")],
  [rb("Dialect and slang amounts"), "Dialect test set, native review; a parser double-checks the amount; unsure means ask"],
  [rb("Invented recipient or amount"), "Strict schema check; recipient only from the real contact list"],
  [rb("Prompt injection, too much agency"), "Read-only tools, no payment tool, token enforced outside the model"],
  [rb("Provider limits, cost, outage"), "Cache, fallback models, spend cap, honest “busy” message"],
  [rb("Voice errors on names"), "Confidence check, read-back, confirm card; text works alone"],
  [rb("Users may not want fewer steps"), "Interviews; report the result even if negative"],
];
s.addTable(risks, { x: 0.6, y: 1.85, w: 7.6, colW: [2.7, 4.9], rowH: 0.6, fontSize: 13, color: INK, fontFace: FONT, border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.04, 0.1, 0.04, 0.1], valign: "middle", objectName: "risk-table" });

head(s, "h-plan", "Plan to the MVP (8 Nov)", 8.7, 1.4, 4.0);
txt(s, "plan", [
  { text: "15–22 Oct  ", options: { bold: true, color: ACCENT } }, { text: "Brief, repo, research, dev-set generation, voice test", options: { breakLine: true, paraSpaceAfter: 12 } },
  { text: "23–29 Oct  ", options: { bold: true, color: ACCENT } }, { text: "Safe core: schema, state machine, mock wallet, tests", options: { breakLine: true, paraSpaceAfter: 12 } },
  { text: "30 Oct–5 Nov  ", options: { bold: true, color: ACCENT } }, { text: "Web UI, test sets, first results", options: { breakLine: true, paraSpaceAfter: 12 } },
  { text: "6–8 Nov  ", options: { bold: true, color: ACCENT } }, { text: "MVP on the dev set, one-page update, rehearsal" },
], { x: 8.7, y: 1.85, w: 4.0, h: 3.9, fontSize: 15 });

txt(s, "repo", [
  { text: "GitHub: ", options: { bold: true, color: ACCENT } },
  { text: REPO, options: { bold: true } },
  { text: "   Daily commits. API keys only in .env, never committed.", options: { color: GRAY } },
], { x: 0.6, y: 6.3, w: 12.1, h: 0.45, fontSize: 16, valign: "middle" });
s.addNotes("Risks map to the OWASP Top 10 for LLM Applications. The plan ends at the fixed MVP deadline of 8 Nov. Voice stays only if the early test passes. The repo link must be live before upload.");

pres.writeFile({ fileName: OUT }).then(() => console.log("wrote", OUT));
