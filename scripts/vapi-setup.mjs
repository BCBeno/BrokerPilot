// Creează sau actualizează asistentul vocal „Ana” în Vapi (după nume) cu uneltele WF02 și raportul de final spre WF03.
// Rulare: npm run vapi:setup   (din rădăcină, cu .env completat)
// Necesită: VAPI_API_KEY, VAPI_SERVER_SECRET, N8N_WEBHOOK_BASE. Opțional: TRANSFER_CALL=1 (transfer real, doar apeluri telefonice), STT=deepgram (nova-2 ro în loc de Azure ro-RO), OPERATOR_PHONE_E164 (transfer), MODEL_VOICE, MODEL_VOICE_PROVIDER, VAPI_VOICE_ID.
// Nu scrie nimic în .env: la final afișează valoarea pentru NEXT_PUBLIC_VAPI_ASSISTANT_ID.
import { readFileSync } from "node:fs";

const { VAPI_API_KEY, VAPI_SERVER_SECRET, N8N_WEBHOOK_BASE, OPERATOR_PHONE_E164, MODEL_VOICE, MODEL_VOICE_PROVIDER, VAPI_VOICE_ID } = process.env;
for (const [k, v] of Object.entries({ VAPI_API_KEY, VAPI_SERVER_SECRET, N8N_WEBHOOK_BASE })) {
  if (!v) { console.error(`Lipsește ${k} în .env`); process.exit(1); }
}
const hook = (p) => `${N8N_WEBHOOK_BASE.replace(/\/+$/, "")}/${p}`;
const server = (p) => ({ url: hook(p), secret: VAPI_SERVER_SECRET });
const NAME = "Ana BrokerPilot";

// `say` = frază rostită cât rulează unealta. Doar la cele care durează; la restul ar dubla ce spune oricum modelul.
// `late` = frază rostită doar dacă răspunsul întârzie peste 1,2 s (apelurile din 12.11: 2,6–3,6 s de tăcere la check_eligibility și start_claim).
const fn = (name, description, properties, required = [], say = null, late = null) => {
  const messages = [
    ...(say ? [{ type: "request-start", content: say }] : []),
    ...(late ? [{ type: "request-response-delayed", timingMilliseconds: 1200, content: late }] : []),
  ];
  return {
    type: "function",
    async: false,
    function: { name, description, parameters: { type: "object", properties, required } },
    server: server("vapi-tools"),
    ...(messages.length ? { messages } : {}),
  };
};
// Enum „da”/„nu”: un boolean cu sens inversat (răniți: da = rău) a fost încurcat de model (12.11).
// Cele patru condiții (în afară de răniți) se întreabă într-o singură frază: un „da” clar la toată întrebarea le acoperă pe toate.
const yn = (d) => ({ type: "string", enum: ["da", "nu"], description: `${d} Răspunde exact cu ce a spus clientul: „da” sau „nu”. Un „da” clar la întrebarea comună despre cele patru condiții înseamnă „da” aici.` });

const tools = [
  fn("check_eligibility", "Verifică dacă accidentul poate fi rezolvat cu amiabila. Cheamă-o abia după ce ai aflat de la client toate cele cinci răspunsuri; nu completa niciunul din prezumție.", {
    injuries: yn("Întrebare: «Există persoane rănite?». «da» DOAR dacă clientul a spus că există răniți; «nu» dacă a spus că nu."),
    twoVehicles: yn("Întrebare: «Sunt implicate exact două vehicule?»."),
    onlyMaterialDamage: yn("Întrebare: «Sunt doar pagube materiale?»."),
    bothInsured: yn("Întrebare: «Ambele vehicule au RCA valabil?»."),
    agreed: yn("Întrebare: «Șoferii sunt de acord asupra circumstanțelor?»."),
  }, ["injuries", "twoVehicles", "onlyMaterialDamage", "bothInsured", "agreed"], null, "Verific imediat."),
  fn("lookup_policy", "Caută polițele clientului, doar dacă el o cere. Trimite telefonul sau plăcuța spuse de client; la apel telefonic, fără niciunul, folosește numărul de pe care sună.", {
    plate: { type: "string", description: "Plăcuța așa cum a fost spusă, ex. «Cluj 11 TST» sau B123ABC" },
    phone: { type: "string", description: "Telefonul clientului, ex. 0722123456" },
  }, [], "Un moment, caut polița."),
  fn("start_claim", "Pregătește dosarul de amiabilă cu ce ai aflat în apel. Cheamă-o doar dacă check_eligibility a spus că se poate și după ce ai întrebat locul, momentul și daunele.", {
    location: { type: "string", description: "Unde s-a întâmplat: stradă/intersecție/reper și localitate, așa cum a spus clientul" },
    occurred: { type: "string", enum: ["acum", "mai devreme"], description: "«acum» dacă accidentul tocmai s-a întâmplat, altfel «mai devreme»" },
    damage: { type: "string", description: "Ce s-a deteriorat la mașina clientului, pe scurt (ex. bară față, aripă dreapta)" },
    impact_zone: { type: "string", enum: ["front-left", "front", "front-right", "left", "right", "rear-left", "rear", "rear-right"], description: "Zona lovită la mașina clientului: front=față, rear=spate, left=lateral stânga, right=lateral dreapta, plus combinațiile de colț" },
    summary: { type: "string", description: "Rezumat scurt al accidentului, fără nume sau numere de identificare" },
  }, ["location", "occurred", "damage", "summary"], null, "Pregătesc dosarul, un moment."),
  fn("escalate_to_human", "Anunță un coleg om: trimite brokerului rezumatul pe Telegram și marchează conversația ca „cere om”. Cheamă-o când clientul cere un om, când sunt răniți sau e urgență (după ce ai spus 112), când e supărat sau confuz după două încercări, sau când întrebarea ține de sfat juridic sau sume. Nu o chema ca să închei apelul.", {
    reason: { type: "string", enum: ["cere_om", "urgenta", "nemultumit", "in_afara_competentei"], description: "cere_om = clientul a cerut un om; urgenta = răniți sau urgență; nemultumit = supărat sau confuz; in_afara_competentei = sfat juridic, sume" },
    summary: { type: "string", description: "Rezumat neutru și factual, 1-2 propoziții, fără nume, fără numere de identificare și fără vinovății" },
    callback_phone: { type: "string", description: "Numărul la care să-l sune colegul, dacă clientul l-a dat. La apel telefonic poate lipsi." },
  }, ["reason", "summary"], "Un moment, anunț un coleg."),
  fn("claim_status", "Spune starea generală a unui dosar după referință.", {
    claim_ref: { type: "string", description: "Referința dosarului: cele 9 cifre auzite, ex. 2611 00004 (prefixul BP nu contează, îl adaugă sistemul)" },
  }, ["claim_ref"]),
];
// Un apel din browser nu poate suna un număr de telefon (testat 12.11: „error-transfer-failed”), deci transferul real e doar la cerere,
// pentru apeluri telefonice: TRANSFER_CALL=1. Escaladarea obișnuită trece prin `escalate_to_human`.
if (process.env.TRANSFER_CALL === "1" && OPERATOR_PHONE_E164) {
  tools.push({
    type: "transferCall",
    destinations: [{ type: "number", number: OPERATOR_PHONE_E164, message: "Vă transfer acum la un coleg. Un moment, vă rog.", description: "Operator uman (broker)" }],
  });
} else {
  console.log("transferCall dezactivat (apel web). Pentru apeluri telefonice: TRANSFER_CALL=1 și OPERATOR_PHONE_E164.");
}

const assistant = {
  name: NAME,
  firstMessage: "Bună ziua! Sunt Ana, asistentul virtual al brokerului dumneavoastră. Cu ce vă pot ajuta?",
  model: {
    // Implicit: modelul OpenAI inclus în Vapi (nu cere cheie proprie). Pentru OpenRouter: MODEL_VOICE_PROVIDER=openrouter
    // + MODEL_VOICE=<model> și adaugă mai întâi cheia OpenRouter în Vapi (Dashboard → Provider Keys).
    provider: MODEL_VOICE_PROVIDER || "openai",
    // gpt-4.1-mini scria română stricată când rezuma rezultatele uneltelor (apel 12.11: „Poliția…recea…twix”); gpt-4.1 e ipoteza următoare.
    model: MODEL_VOICE || "gpt-4.1",
    temperature: 0.3,
    messages: [{ role: "system", content: readFileSync(new URL("../prompts/ana-system.md", import.meta.url), "utf8") }],
    tools,
  },
  // Română explicită: „multi” a transcris româna ca maghiară/portugheză/arabă (test 12.11). Alternativă: deepgram nova-2 cu language "ro".
  transcriber: process.env.STT === "deepgram" ? { provider: "deepgram", model: "nova-2", language: "ro" } : { provider: "azure", language: "ro-RO" },
  voice: VAPI_VOICE_ID
    ? { provider: "11labs", model: "eleven_multilingual_v2", voiceId: VAPI_VOICE_ID }
    : { provider: "azure", voiceId: "ro-RO-AlinaNeural" },
  backgroundDenoisingEnabled: true,
  // Pauze mai lungi când clientul dictează sau povestește: la 0,4 s Vapi răspundea în mijlocul propoziției („Cluj 1 1. Sunt.”).
  startSpeakingPlan: {
    // 0,6 → 0,4 (implicit Vapi), 12.11: tururile durau 2,3–3,5 s. Dictarea e acoperită de regulile de mai jos, nu de waitSeconds.
    waitSeconds: 0.4,
    transcriptionEndpointingPlan: { onPunctuationSeconds: 0.3, onNoPunctuationSeconds: 2, onNumberSeconds: 1.5 },
    customEndpointingRules: [
      { type: "assistant", regex: "(telefon|cifr|litere|plăcu|număr|referin)", regexOptions: [{ type: "ignore-case", enabled: true }], timeoutSeconds: 3 },
      { type: "assistant", regex: "(unde s-a întâmplat|ce parte|ce s-a stricat)", regexOptions: [{ type: "ignore-case", enabled: true }], timeoutSeconds: 2.5 },
    ],
  },
  analysisPlan: {
    summaryPlan: {
      enabled: true,
      timeoutSeconds: 10,
      messages: [
        { role: "system", content: "Rezumă apelul în română, în 3-4 propoziții neutre și factuale pentru un broker de asigurări: ce s-a întâmplat, ce s-a stabilit (eligibilitate pentru amiabilă, dacă sunt răniți, locul), ce a cerut clientul și ce rămâne de făcut. Nu atribui vina nimănui, nu include nume sau numere de identificare. Returnează doar rezumatul." },
        { role: "user", content: "Transcript:\n\n{{transcript}}\n\nMotivul încheierii apelului: {{endedReason}}" },
      ],
    },
  },
  server: server("vapi-end-of-call"),
  serverMessages: ["end-of-call-report"],
  endCallMessage: "Mulțumesc pentru apel. O zi bună!",
  maxDurationSeconds: 600,
};

// Vapi normalizează textul pentru engleză înainte de TTS (acronyme, date, numere): „2027” → „To thousand twentyseven”, „R C A” → „rece”.
// Lăsăm doar curățarea de markdown; numerele, datele și acronimele le pronunță vocea română.
// minCharacters 30 → 15: prima frază scurtă („Am înțeles.”) pleacă mai repede spre voce.
assistant.voice.chunkPlan = { enabled: true, minCharacters: 15, formatPlan: { formattersEnabled: ["markdown", "asterisk", "stripAsterisk", "newline", "colon"] } };

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.vapi.ai${path}`, { ...init, headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
};

const list = await api("/assistant?limit=100");
const existing = list.find((a) => a.name === NAME);
const saved = existing
  ? await api(`/assistant/${existing.id}`, { method: "PATCH", body: JSON.stringify(assistant) })
  : await api("/assistant", { method: "POST", body: JSON.stringify(assistant) });
console.log(`${existing ? "Actualizat" : "Creat"}: ${NAME}\nNEXT_PUBLIC_VAPI_ASSISTANT_ID=${saved.id}`);
