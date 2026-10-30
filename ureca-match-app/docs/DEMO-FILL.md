# Demo fill

A **Fill demo** section inside the debug clock panel (click the clock at the top right) that types the prepared text into forms, so the live demo does not wait on typing. It only appears when `NEXT_PUBLIC_DEBUG_CLOCK=true`. Add it to `DEMO-SETUP.md`'s settings.

## Settings

`api/.env`:

```
DEMO_FRESH=true
GEMINI_API_KEY=<your key>
```

- `DEMO_FRESH=true` empties the Deep Learning project (nobody applied, 1 slot) so only the demo students compete for it. The earlier placement moves to another project. Leave it out for the normal seed.
- A Gemini key is needed for the story below. Without one, AI match uses the local formula, which does not read documents and will rank the higher CGPA first.

Restart the API after changing `.env`. Both settings are read when the API starts.

## Using it

1. Open a tab per actor, as in `DEMO-SETUP.md`.
2. In each student tab, open the clock panel and pick **Student 1** or **Student 2** under Fill demo. The tab remembers it.
3. On the page you want filled, click **Fill this page**. It types field by field. Nothing is sent for you: you press Save, Apply or Send.

| Page | What Fill does |
| --- | --- |
| My profile | Uploads the transcript (the details fill themselves in), adds the interests one by one, uploads the portfolio, saves |
| Apply to a project | Types the statement |
| Propose a project | Picks Prof. Marcus Chua, types title, description, interests and statement, stops on Review |
| Propose a project (Revise on a declined one) | Same, with the improved text |
| Supervisor, New project | Types a second project that is not in the seed (rooftop farming) and sets the cover. Stops on the last step |
| Supervisor, Proposals, Decline dialog open | Types the decline reason |

Not filled: sign up and sign in.

## The story

| | Student 1 | Student 2 |
| --- | --- | --- |
| CGPA | 3.48 | 4.84 |
| Statement | Specific: results, method, clinic attachment | General |
| Portfolio | Project write-ups with numbers | One page of awards |
| Round 2 result | Ranked first by the AI score, gets the offer | Not matched |
| Self-proposal | None | First draft declined. Revise, resend, accepted in Round 3 |

Both apply to Deep Learning for Early Detection of Diabetic Retinopathy (1 slot).

## Editing the text

All text and file names are in `web/lib/demo-data.ts`. The PDFs are in `web/public/demo/`. The supervisor's decline reason and the second project are in the same file.
