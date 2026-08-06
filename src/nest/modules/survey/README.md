# Survey Nest Module

Controller prefix: `/survey` (proxied as `/api/survey` from Vue).

## Submodules

| File | Responsibility |
|------|----------------|
| `survey.service` | CRUD, questions, logic, publish lifecycle, share, notify-share |
| `fill.service` | Public fill, draft, submit, anti-cheat |
| `statistics.service` | Overview, question/cross/quality, filter/compare, export tasks |
| `scoring.service` | Auto/manual grading, ranking, distribution, certificates |
| `template.service` | Templates + question bank |

## Extension points

- AI question generation, collaborative edit, scheduled email reports — not implemented; keep adapters at service boundary.
