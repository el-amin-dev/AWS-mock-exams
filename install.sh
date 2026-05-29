#!/usr/bin/env bash
#
# setup.sh — initialise the AWS-mock-exams repo and push it to GitHub.
# Safe to re-run: it overwrites README/LICENSE, only commits when there are
# changes, and only creates the remote if one isn't wired up yet.
#
set -euo pipefail

REPO_NAME="AWS-mock-exams"
REPO_DESC="Daily AWS SAA-C03 mock exams: a single-file HTML engine + daily mock JSON files."
LICENSE_YEAR="2026"
LICENSE_HOLDER="sys-dev-amin"   # <-- change to your name if you prefer

# --- sanity checks -----------------------------------------------------------
command -v git >/dev/null || { echo "git not found"; exit 1; }
command -v gh  >/dev/null || { echo "gh (GitHub CLI) not found"; exit 1; }
[ -d .git ] || git init -b main

# --- README ------------------------------------------------------------------
cat > README.md << 'README_EOF'
# AWS SAA-C03 Daily Mock Exams

A lightweight, **single-file** browser-based mock-exam engine for the **AWS Certified Solutions Architect – Associate (SAA-C03)** exam, plus a growing set of daily practice mocks.

The idea: sit **one short, exam-style mock every day**, scoped only to the lessons studied that day, and let the engine surface the topics you keep missing so the next day's mock reinforces them.

> ⚠️ **Unofficial personal study project.** Not affiliated with, endorsed by, or sponsored by Amazon Web Services or Adrian Cantrill. All questions are original practice items written for self-study — they are **not** real exam questions or "dumps".

## Contents
| Path | Purpose |
|------|---------|
| `SAA-c03.html` | The exam engine (UI, timer, scoring, explanations). Rarely needs changes. |
| `mocks/mock01.json` | Day 1 mock — AWS Accounts, Root User, MFA, IAM Basics. |
| `mocks/mockNN.json` | One new mock per study day. |
| `LICENSE` | MIT — free to reuse and adapt the engine. |

## Features
- Pearson/VUE-style exam interface that runs fully offline — no build, no dependencies.
- Auto-derived timer (**120s × number of questions**).
- Single-answer and multi-answer ("Select TWO") questions.
- Flag-for-review, question navigation, and a hard stop when time runs out.
- Score report with pass/fail, per-domain breakdown, and **weak-topic detection**.
- Per-option explanations ("why each option is right or wrong") shown after scoring.
- Built-in generator that produces the prompt for the **next day's** mock, carrying weak topics forward.

## How to use

**Option A — drag & drop (simplest):**
1. Open `SAA-c03.html` in your browser.
2. Drag a mock file (e.g. `mocks/mock01.json`) onto the loader, or click to pick it.

**Option B — auto-load via URL (needs a local server):**
Browsers block `fetch()` over `file://`, so serve the folder first:
```bash
python3 -m http.server 8000
# then open: http://localhost:8000/SAA-c03.html?file=mocks/mock01.json
```

## Daily workflow
1. Watch the day's course lessons.
2. Generate that day's `mockNN.json` (the report screen builds a ready-to-paste prompt that includes your weak topics).
3. Save it into `mocks/`, drop it into the engine, and sit the exam.
4. Review the per-option explanations.
5. Commit it: `git add mocks/mockNN.json && git commit -m "Day N mock" && git push`.

## mock.json schema
```json
{
  "exam_id": "cantrill-saa-c03-daily",
  "day": 1,
  "date": "YYYY-MM-DD",
  "title": "SAA-C03 Daily Mock",
  "subtitle": "Day N — topics",
  "topics_covered": ["..."],
  "config": { "seconds_per_question": 120, "pass_percent": 70, "randomize_questions": true, "randomize_options": true },
  "questions": [
    {
      "topic": "short topic label",
      "domain": "Resilient | High-Performing | Secure | Cost-Optimized | Operations/IaC",
      "stem": "scenario question (end multi-answer with '(Select TWO.)')",
      "options": [
        { "text": "option text", "correct": true, "why": "Correct — ... / Wrong — ..." }
      ]
    }
  ]
}
```
Engine rules: single-answer = **4 options, exactly 1 correct**; multi-answer = **5 options, exactly 2 correct**; every option needs a `why`.

## License
Released under the [MIT License](LICENSE) — you're free to reuse, modify, and redistribute the engine.
README_EOF

# --- LICENSE (MIT) -----------------------------------------------------------
cat > LICENSE << LICENSE_EOF
MIT License

Copyright (c) ${LICENSE_YEAR} ${LICENSE_HOLDER}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LICENSE_EOF

# --- move mock JSON files into mocks/ ----------------------------------------
mkdir -p mocks
shopt -s nullglob
for f in mock*.json; do
  echo "moving $f -> mocks/"
  mv -f "$f" mocks/
done
shopt -u nullglob

# --- commit (only if there is something to commit) ---------------------------
git add -A
git branch -M main
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -m "Set up SAA-C03 mock engine: README, MIT license, mocks/ layout"
fi

# --- create remote + push ----------------------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' already exists — pushing main..."
  git push -u origin main
else
  echo "Creating public repo '${REPO_NAME}' and pushing..."
  gh repo create "${REPO_NAME}" --public --source=. --remote=origin --push \
    --description "${REPO_DESC}"
fi

echo
echo "Done. View it with: gh repo view --web"
