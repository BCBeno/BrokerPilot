import { describe, expect, it } from "vitest";
import { getServerEnv } from "@/lib/env";

describe("getServerEnv", () => {
  it("folosește valori implicite și ignoră șirurile goale", () => {
    const env = getServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "", BP_WEBHOOK_SECRET: "s3cret" });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.BP_WEBHOOK_SECRET).toBe("s3cret");
  });

  it("respinge un URL invalid", () => {
    expect(() => getServerEnv({ N8N_WEBHOOK_BASE: "nu-e-url" })).toThrow();
  });
});
