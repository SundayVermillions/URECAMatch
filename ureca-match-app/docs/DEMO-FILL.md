# Demo fill

A **Fill demo** section inside the debug clock panel (click the clock at the top right) that types the prepared text into forms, so the live demo does not wait on typing. It only appears when `NEXT_PUBLIC_DEBUG_CLOCK=true`. Add it to `DEMO-SETUP.md`'s settings.

## Settings

`api/.env`:

```
DEMO_FRESH=true
GEMINI_API_KEY=<your key>
```

- `DEMO_FRESH=true` empties the Deep Learning project (nobody applied, 1 slot) so only the demo students compete for it. It also removes the seeded student proposals, so each supervisor's Proposals page starts empty. The earlier placement moves to another project. Leave it out for the normal seed.
- A Gemini key is needed for the story below. Without one, AI match uses the local formula, which does not read documents and will rank the higher CGPA first.

Restart the API after changing `.env`. Both settings are read when the API starts.

## Using it

1. Open a tab per actor, as in `DEMO-SETUP.md`.
2. In each student tab, open the clock panel and pick **Student 1** or **Student 2** under Fill demo. The tab remembers it. Student 1 is a new account you register (Jason Tan). Student 2 is Wei Ling (`stu-1`), who already has her transcript and CV, so nothing is uploaded for her.
3. On the page you want filled, click **Fill this page**. It types field by field. Nothing is sent for you: you press Save, Apply or Send.

| Page | What Fill does |
| --- | --- |
| My profile | Uploads the transcript if there is none (the details fill themselves in), adds the interests one by one, uploads the portfolio if the student has one, saves |
| Apply to a project | Types the statement |
| Propose a project | Picks Prof. Marcus Chua, types title, description, interests and statement, stops on Review |
| Propose a project (Revise on a declined one) | Same, with the improved text |
| Supervisor, New project | Types a second project that is not in the seed (Graph Learning for Traffic Forecasting, no prerequisites) and sets the cover. Stops on the last step |
| Supervisor, Proposals, Decline dialog open | Types the decline reason |

Not filled: sign up and sign in.

## The story

| | Student 1 (new, Jason Tan) | Student 2 (Wei Ling, preloaded) |
| --- | --- | --- |
| CGPA | 4.67 | 3.99 |
| Statement | General | Specific: kappa, calibration, Grad-CAM |
| CV | None | Retinal CNN grading, calibration, explainability |
| Round 2 result | Not matched | Ranked first by the AI score, gets the offer |
| Self-proposal | First draft declined. Revise, resend, accepted in Round 3 | None |

Both apply to Deep Learning for Early Detection of Diabetic Retinopathy (1 slot). Both have SC4001, so both meet the prerequisite.

Files for Student 1: the transcript `web/public/demo/mock-transcript-JasonTan.pdf`. Upload no CV. The same file is in `URECAMatch-demo-transcripts` with `mock-CV-JasonTan.pdf` if you want a weak CV instead.

## Editing the text

All text and file names are in `web/lib/demo-data.ts`. The PDFs are in `web/public/demo/`. Wei Ling's own files are in `api/app/db/demo_docs/`. The supervisor's decline reason and the second project are in the same file.
