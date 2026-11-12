import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const SECRET = "test-secret-kb";

function request(opts: { secret?: string; file?: File | string }) {
  const form = new FormData();
  if (opts.file !== undefined) form.set("file", opts.file);
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-bp-secret"] = opts.secret;
  return new Request("http://localhost/api/kb/parse", { method: "POST", headers, body: form });
}

const textFile = (s: string) => new File([s], "doc.txt", { type: "text/plain" });

describe("POST /api/kb/parse", () => {
  const prev = process.env.BP_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.BP_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.BP_WEBHOOK_SECRET;
    else process.env.BP_WEBHOOK_SECRET = prev;
  });

  it("respinge cererile fără secret sau cu secret greșit", async () => {
    expect((await POST(request({ file: textFile("x") }))).status).toBe(401);
    expect((await POST(request({ secret: "gresit", file: textFile("x") }))).status).toBe(401);
  });

  it("întoarce 503 când secretul nu e configurat pe server", async () => {
    delete process.env.BP_WEBHOOK_SECRET;
    expect((await POST(request({ secret: SECRET, file: textFile("x") }))).status).toBe(503);
  });

  it("cere fișierul", async () => {
    expect((await POST(request({ secret: SECRET }))).status).toBe(400);
    expect((await POST(request({ secret: SECRET, file: "nu e fișier" }))).status).toBe(400);
  });

  it("întoarce paginile unui fișier text", async () => {
    const res = await POST(request({ secret: SECRET, file: textFile("Condiţii generale") }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalPages: 1, pages: [{ page: 1, text: "Condiții generale" }] });
  });

  it("respinge un fișier binar necunoscut cu 415", async () => {
    const bin = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])], "doc.docx");
    expect((await POST(request({ secret: SECRET, file: bin }))).status).toBe(415);
  });
});
