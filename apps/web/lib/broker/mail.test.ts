import { afterEach, describe, expect, it, vi } from "vitest";
import { accessEmail, sendAccessEmail } from "./mail";

const msg = { to: "ana@firma.ro", name: "Ana <Pop>", link: "https://app.test/broker/parola?token_hash=abc&type=invite", type: "invite" as const };

describe("accessEmail", () => {
  it("pune linkul în text și în HTML, cu numele escapat", () => {
    const m = accessEmail(msg);
    expect(m.subject).toBe("Contul dvs. BrokerPilot");
    expect(m.text).toContain(msg.link);
    expect(m.html).toContain("token_hash=abc&amp;type=invite");
    expect(m.html).toContain("Ana &lt;Pop&gt;");
    expect(m.html).not.toContain("<Pop>");
  });

  it("are alt subiect și nota de ignorare la link nou", () => {
    const m = accessEmail({ ...msg, type: "recovery" });
    expect(m.subject).toBe("Link nou pentru contul BrokerPilot");
    expect(m.text).toContain("parola actuală rămâne valabilă");
  });
});

describe("sendAccessEmail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fără cheie nu trimite nimic", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await sendAccessEmail({ from: "x <a@b.ro>" }, msg)).toBe("off");
    expect(f).not.toHaveBeenCalled();
  });

  it("întoarce sent / failed după răspunsul Resend", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await sendAccessEmail({ apiKey: "re_test", from: "x <a@b.ro>" }, msg)).toBe("sent");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"name":"validation_error"}', { status: 422 })));
    expect(await sendAccessEmail({ apiKey: "re_test", from: "x <a@b.ro>" }, msg)).toBe("failed");
  });
});
