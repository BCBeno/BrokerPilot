"""Sparge PLAN_PROIECT.md in docs/spec/*.md (cate un fisier per modul).

PLAN_PROIECT.md ramane documentul master. Dupa ce il editezi, ruleaza din radacina repo-ului:
    python scripts/split-plan.py
Fisierele din docs/spec/ sunt generate: nu le edita direct.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "PLAN_PROIECT.md"
OUT = ROOT / "docs" / "spec"

# fisier -> (titlu, sectiuni din plan, in ordinea in care apar in fisier)
LAYOUT = {
    "00-overview.md": ("Overview: TL;DR, decizii, scope, arhitectura", ["intro", "0", "3", "4", "5"]),
    "01-amiabila.md": ("Modul: amiabila digitala (fluxul principal)", ["7.1"]),
    "02-voce.md": ("Modul: agentul vocal Vapi", ["7.2"]),
    "03-dashboard.md": ("Modul: dashboard broker", ["7.7"]),
    "04-dosar-unic-identitate.md": ("Modul: dosar unic omnicanal + identitate", ["7.9"]),
    "05-rag.md": ("Modul: copilot RAG", ["7.6"]),
    "06-verificator.md": ("Modul: verificator de documente", ["7.8"]),
    "07-inbox.md": ("Modul: inbox inteligent (triaj email)", ["7.5"]),
    "08-telegram.md": ("Modul: boti Telegram (client + broker)", ["7.3", "7.4"]),
    "10-infra-cicd.md": ("Transversal: infrastructura, CI/CD, conturi si .env", ["6", "11", "20"]),
    "11-date.md": ("Transversal: model de date + date de demo", ["8", "14"]),
    "12-ai.md": ("Transversal: strategia AI (routing, principii, anonimizare)", ["10"]),
    "13-n8n-workflows.md": ("Transversal: workflow-uri n8n si standarde", ["9"]),
    "14-monitorizare-securitate.md": ("Transversal: monitorizare, securitate, GDPR", ["12", "13"]),
    "20-demo.md": ("Prezentare: scenariu de demo, riscuri, costuri", ["16", "17", "18"]),
    "21-documentatie.md": ("Livrabil: structura documentatiei", ["19"]),
    "90-context.md": ("Context: anuntul, ce exista la ei, problema, intrebari deschise", ["1", "2", "23"]),
    "99-sesiuni.md": ("Planificare: plan pe zile, sesiuni Claude, prompt initial", ["15", "24", "21", "22"]),
}

H2 = re.compile(r"^## (\d+)\. ")
H3_MODULE = re.compile(r"^### (7\.\d+) ")


def parse_sections(text: str) -> dict[str, str]:
    """Imparte planul in sectiuni '## N.'; sectiunea 7 e impartita pe subsectiuni '### 7.x'."""
    # tot ce e inainte de primul '## N.' (titlu, termene, echipa) devine sectiunea 'intro'
    sections: dict[str, list[str]] = {"intro": []}
    current = "intro"
    for line in text.splitlines():
        if current == "intro" and line.startswith("# "):
            continue
        m2 = H2.match(line)
        m3 = H3_MODULE.match(line)
        if m2:
            current = m2.group(1)
            sections[current] = [line]
        elif m3:
            current = m3.group(1)
            # promovam subsectiunea la nivel 2 ca fisierul sa aiba o ierarhie curata
            sections[current] = ["## " + line[4:]]
        elif current is not None:
            if current.startswith("7.") and line.startswith("#### "):
                line = line[1:]
            elif current.startswith("7.") and line.startswith("### "):
                line = "#" + line
            sections[current].append(line)
    cleaned = {}
    for key, lines in sections.items():
        body = "\n".join(lines).rstrip()
        body = re.sub(r"\n-{3,}\s*$", "", body).rstrip()
        cleaned[key] = body
    return cleaned


def main() -> None:
    sections = parse_sections(SRC.read_text(encoding="utf-8"))
    used = set()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (title, keys) in LAYOUT.items():
        missing = [k for k in keys if k not in sections]
        if missing:
            raise SystemExit(f"{name}: lipsesc sectiunile {missing} din PLAN_PROIECT.md")
        parts = [
            f"# {title}",
            "",
            f"<!-- Generat din PLAN_PROIECT.md (sectiunile {', '.join(keys)}) de scripts/split-plan.py. Nu edita aici. -->",
            "",
        ]
        parts += [sections[k] + "\n" for k in keys]
        (OUT / name).write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
        used.update(keys)
    # sectiunea 7 are doar un titlu, continutul e in 7.x
    leftover = sorted(set(sections) - used - {"7"})
    if leftover:
        raise SystemExit(f"Sectiuni nemapate (adauga-le in LAYOUT): {leftover}")
    print(f"OK: {len(LAYOUT)} fisiere in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
