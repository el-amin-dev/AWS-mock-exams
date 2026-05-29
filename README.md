# AWS SAA-C03 Daily Mock Exams

A lightweight, **single-file** browser-based mock-exam engine for the **AWS Certified Solutions Architect – Associate (SAA-C03)** exam, plus a growing set of daily practice mocks.

The idea: sit **one short, exam-style mock every day**, scoped only to the lessons studied that day, and let the engine surface the topics you keep missing so the next day's mock reinforces them.

> ⚠️ **Unofficial personal study project.** Not affiliated with, endorsed by, or sponsored by Amazon Web Services or Adrian Cantrill. All questions are original practice items written for self-study — they are **not** real exam questions or "dumps".

## Contents
| File | Purpose |
|------|---------|
| `SAA-c03.html` | The exam engine (UI, timer, scoring, explanations). Rarely needs changes. |
| `mock01.json` | Day 1 mock — AWS Accounts, Root User, MFA, IAM Basics. |
| `mockNN.json` | One new mock per study day. |

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
2. Drag a mock file (e.g. `mock01.json`) onto the loader, or click to pick it.

**Option B — auto-load via URL (needs a local server):**
Browsers block `fetch()` over `file://`, so serve the folder first:
```bash
python3 -m http.server 8000
# then open: http://localhost:8000/SAA-c03.html?file=mock01.json
```

## Daily workflow
1. Watch the day's course lessons.
2. Generate that day's `mockNN.json` (the report screen builds a ready-to-paste prompt that includes your weak topics).
3. Drop the new mock into the engine and sit the exam.
4. Review the per-option explanations.
5. Commit it: `git add mockNN.json && git commit -m "Day N mock" && git push`.

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
Add a license (e.g. MIT) if you want others to reuse the engine.
