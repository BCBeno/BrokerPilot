import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayError, textCall, visionCall } from "./gateway";

const request = { messages: [{ role: "user" as const, content: "salut" }], schemaName: "demo", jsonSchema: { type: "object" } };

const ok = (content = '{"a":1}', usage: Record<string, number> = { prompt_tokens: 1000, completion_tokens: 200 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage }), { status: 200 });

const saved = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.GROQ_API_KEY = "groq-key";
  process.env.GEMINI_API_KEY = "gem-key";
  delete process.env.MODEL_VISION;
  delete process.env.MODEL_TEXT;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; // fără bază: logarea în `ai_calls` nu face nimic
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = { ...saved };
});

const sent = (i = 0) => ({ url: fetchMock.mock.calls[i][0] as string, init: fetchMock.mock.calls[i][1] as RequestInit });
const bodyOf = (i = 0) => JSON.parse(sent(i).init.body as string) as Record<string, unknown>;

describe("textCall (Groq)", () => {
  it("cheamă Groq cu JSON schema strictă, plafon `max_completion_tokens` și efort de raționament pentru gpt-oss", async () => {
    const reply = await textCall("verify@1", { redacted: true })(request);
    expect(sent().url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((sent().init.headers as Record<string, string>).Authorization).toBe("Bearer groq-key");
    const body = bodyOf();
    expect(body).toMatchObject({ model: "openai/gpt-oss-20b", max_completion_tokens: 2000, reasoning_effort: "low", temperature: 0 });
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "demo", strict: true } });
    // parametri specifici OpenRouter nu mai pleacă
    expect(body).not.toHaveProperty("provider");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("max_tokens");
    expect(reply.text).toBe('{"a":1}');
  });

  it("nu trimite `reasoning_effort` modelelor care nu sunt gpt-oss", async () => {
    await textCall("verify@1", { model: "qwen/qwen3.8-27b" })(request);
    expect(bodyOf()).not.toHaveProperty("reasoning_effort");
  });

  it("estimează costul din tokeni (Groq nu îl întoarce)", async () => {
    const reply = await textCall("verify@1", { model: "openai/gpt-oss-120b" })(request);
    expect(reply).toMatchObject({ inputTokens: 1000, outputTokens: 200 });
    expect(reply.costUsd).toBeCloseTo((1000 * 0.15 + 200 * 0.6) / 1_000_000, 8);
  });

  it("refuză fără cheie", () => {
    delete process.env.GROQ_API_KEY;
    expect(() => textCall("verify@1")).toThrow(GatewayError);
  });
});

describe("visionCall (Gemini direct)", () => {
  it("cheamă Gemini cu `max_tokens` și `reasoning_effort: low`", async () => {
    await visionCall("extract@2")(request);
    expect(sent().url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(bodyOf()).toMatchObject({ model: "gemini-3.6-flash", max_tokens: 2000, reasoning_effort: "low" });
    expect(bodyOf()).not.toHaveProperty("max_completion_tokens");
  });

  it("scoate prefixul „google/” din MODEL_VISION (valoarea veche de OpenRouter)", async () => {
    process.env.MODEL_VISION = "google/gemini-3.5-flash-lite";
    await visionCall("extract@2")(request);
    expect(bodyOf().model).toBe("gemini-3.5-flash-lite");
  });

  it("refuză fără cheia Gemini", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => visionCall("extract@2")).toThrow(/GEMINI_API_KEY/);
  });

  it("la 503 pe modelul principal trece imediat la cel de rezervă, fără reîncercare pe primul", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(ok());
    const reply = await visionCall("extract@2")(request);
    expect(reply.text).toBe('{"a":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).model).toBe("gemini-3.6-flash");
    expect(bodyOf(1).model).toBe("gemini-3.5-flash-lite");
  });

  it("un timeout al modelului principal trece la rezervă (nu pică cu o eroare brută)", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError")).mockResolvedValueOnce(ok());
    const reply = await visionCall("extract@2")(request);
    expect(reply.text).toBe('{"a":1}');
    expect(bodyOf(1).model).toBe("gemini-3.5-flash-lite");
  });

  it("dacă și rezerva cade, dă GatewayError", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    const pending = visionCall("extract@2")(request);
    const assertion = expect(pending).rejects.toThrow(/gemini.*503/);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 principal + 2 rezervă
  });

  it("nu folosește rezerva la o eroare de cerere (400) și nici când modelul ales e chiar rezerva", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await expect(visionCall("extract@2")(request)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    process.env.MODEL_VISION = "google/gemini-3.5-flash-lite";
    await visionCall("extract@2")(request);
    expect(bodyOf(1).model).toBe("gemini-3.5-flash-lite");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("erori și reîncercări", () => {
  it("reia o dată la 429 și întoarce răspunsul", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(ok());
    const pending = textCall("verify@1")(request);
    await vi.advanceTimersByTimeAsync(2100);
    await expect(pending).resolves.toMatchObject({ text: '{"a":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("după două 429 dă GatewayError cu codul de stat în mesaj", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    const pending = textCall("verify@1")(request);
    const assertion = expect(pending).rejects.toThrow(/groq.*429/);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("nu reia la 400 și semnalează răspunsul gol", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await expect(textCall("verify@1")(request)).rejects.toThrow(/groq.*400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: {}, finish_reason: "length" }] }), { status: 200 }));
    await expect(textCall("verify@1")(request)).rejects.toThrow(/length/);
  });
});
