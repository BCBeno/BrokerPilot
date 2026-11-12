/**
 * Preț de listă în USD per 1 milion de tokeni (intrare, ieșire). Groq și Gemini nu întorc costul în răspuns, iar planurile
 * gratuite nu costă nimic, dar plafonul zilnic (`AI_DAILY_BUDGET_USD`) și pagina „Costuri AI” lucrează cu această estimare:
 * ce ar costa apelurile la tarif plătit. Modelele care lipsesc de aici nu primesc cost (rămâne gol, nu 0).
 */
const PRICES: Record<string, readonly [input: number, output: number]> = {
  "gemini-3.6-flash": [0.75, 3.75],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "openai/gpt-oss-120b": [0.15, 0.6],
  "openai/gpt-oss-20b": [0.075, 0.3],
  "qwen/qwen3.8-27b": [0.15, 1.88],
};

export function estimateCostUsd(model: string, inputTokens?: number, outputTokens?: number): number | undefined {
  const price = PRICES[model];
  if (!price || inputTokens === undefined || outputTokens === undefined) return undefined;
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}
