import { describe, it, expect } from "vitest";
import { asrFromEnv } from "../src/factory";

describe("asrFromEnv", () => {
  it("off when nothing is configured (the text path never depends on voice)", () => {
    const c = asrFromEnv({});
    expect(c.provider).toBe("off");
    expect(c.transcriber).toBeNull();
  });
  it("regalabs by default when a key is present, language auto-detected (Arabic and Kurdish screens), public base URL", () => {
    const c = asrFromEnv({ REGALABS_API_KEY: "rega_live_x" });
    expect(c.provider).toBe("regalabs");
    expect(c.language).toBe("auto");
    expect(c.transcriber?.id).toBe("regalabs:auto");
    expect(c.description).toContain("auto-detected");
    expect(asrFromEnv({ REGALABS_API_KEY: "k", REGALABS_ASR_LANGUAGE: "auto" }).transcriber?.id).toBe("regalabs:auto");
    expect(c.description).toContain("api.regalabs.dev");
    expect(c.description).not.toContain("rega_live_x");
  });
  it("regalabs selected without a key: off, with a reason", () => {
    const c = asrFromEnv({ ASR_PROVIDER: "regalabs" });
    expect(c.provider).toBe("off");
    expect(c.description).toMatch(/REGALABS_API_KEY/);
  });
  it("an explicit dedicated stream URL selects the streaming adapter without revealing the key", () => {
    const c = asrFromEnv({ REGALABS_API_KEY: "rega_live_private", REGALABS_STREAM_URL: "wss://api.regalabs.dev/v1/audio/transcriptions/stream" });
    expect(c.provider).toBe("regalabs"); expect(c.language).toBe("auto");
    expect(c.transcriber?.id).toBe("regalabs-stream:auto");
    expect(c.description).toContain("stream"); expect(c.description).not.toContain("rega_live_private");
  });
  it.each(["invalid", "ws://public.example/stream", "wss://user:password@example.com/stream"])("invalid stream config leaves voice off and text available: %s", (url) => {
    const c = asrFromEnv({ REGALABS_API_KEY: "k", REGALABS_STREAM_URL: url });
    expect(c.provider).toBe("off"); expect(c.transcriber).toBeNull();
  });
  it("language and base URL can be overridden", () => {
    const c = asrFromEnv({ REGALABS_API_KEY: "k", REGALABS_ASR_LANGUAGE: "ar", REGALABS_BASE_URL: "http://localhost:8080/v1" });
    expect(c.language).toBe("ar");
    expect(c.description).toContain("localhost:8080");
  });
  it("openai-compat needs base URL and key", () => {
    expect(asrFromEnv({ ASR_PROVIDER: "openai-compat" }).provider).toBe("off");
    expect(asrFromEnv({ ASR_PROVIDER: "openai-compat", ASR_BASE_URL: "https://api.groq.com/openai/v1", ASR_API_KEY: "g", ASR_MODEL: "whisper-large-v3" }).transcriber?.id).toBe("openai-compat:whisper-large-v3");
  });
  it("fake is explicit only", () => expect(asrFromEnv({ ASR_PROVIDER: "fake" }).provider).toBe("fake"));
  it("max seconds is bounded", () => {
    expect(asrFromEnv({ ASR_MAX_SECONDS: "9999" }).maxSeconds).toBe(30);
    expect(asrFromEnv({ ASR_MAX_SECONDS: "20" }).maxSeconds).toBe(20);
  });
});
