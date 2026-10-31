/** The words and files the demo "Fill demo" button types in. Edit the text here; no other code needs to change.
 *  Story: Student 1 (Jason Tan, a new account) has the high CGPA, no CV and a general statement. Their self-proposal is declined, then revised and accepted.
 *  Student 2 (Wei Ling Tan, preloaded with a transcript and CV) has the lower CGPA but a specific statement and a CV full of related work,
 *  so the AI score puts her first. */
export type DemoRole = "s1" | "s2";

export type DemoProposal = { title: string; description: string; interests: string[]; statement: string };

const NONE: DemoProposal = { title: "", description: "", interests: [], statement: "" };

export const DEMO: Record<DemoRole, {
  label: string;
  transcript: string;
  portfolio: string; // empty: nothing to upload
  interests: string[];
  applyStatement: string;
  proposal: DemoProposal;
  revisedProposal: DemoProposal;
}> = {
  s1: {
    label: "Student 1",
    transcript: "/demo/mock-transcript-JasonTan.pdf",
    portfolio: "",
    interests: ["Machine Learning", "Statistics"],
    applyStatement:
      "I am interested in artificial intelligence and took SC4001 Neural Network and Deep Learning this year. " +
      "I think this project is a good chance to learn more about deep learning in healthcare. " +
      "I have a high CGPA, I am a hard working student and I am willing to learn whatever is needed to contribute to the project.",
    proposal: {
      title: "Using AI on medical images",
      description:
        "I would like to study how deep learning can help doctors with medical images. The project would look at different kinds of scans and see " +
        "whether a neural network can find problems early. I would use public data and try a few models to see which one works best.",
      interests: ["Healthcare AI", "Deep Learning"],
      statement:
        "I did well in the deep learning module and I am very interested in healthcare. I think Prof. Chua is a good fit because of the work " +
        "in the lab on medical AI. I am ready to work hard and learn from the supervisor.",
    },
    revisedProposal: {
      title: "Calibrating CNN graders for diabetic retinopathy screening",
      description:
        "Grading models can be accurate but over-confident, which is risky when a clinician relies on the score. This project compares temperature " +
        "scaling and focal loss as ways to calibrate a ResNet grader on the public APTOS fundus dataset. I will report kappa and expected " +
        "calibration error on a held-out split, and show reliability diagrams for each method.",
      interests: ["Healthcare AI", "Deep Learning", "Medical Imaging"],
      statement:
        "Since your feedback I ran a small experiment: a ResNet-18 on 500 APTOS images reached a kappa of 0.71 with an uncalibrated error of 11%. " +
        "I now have one dataset and one question, as you suggested. I took SC4001 and can commit 8 hours a week. " +
        "I would like to work under you because your lab already works on explainable grading, so the calibration results would feed straight into it.",
    },
  },
  s2: {
    label: "Student 2 (Wei Ling)",
    transcript: "/demo/Transcript_WeiLingTan.pdf", // already on her profile; used only if it was deleted
    portfolio: "", // her CV is already on her profile
    interests: ["Deep Learning", "Machine Learning"],
    applyStatement:
      "I trained ResNet-50 and EfficientNet-B3 models to grade diabetic retinopathy on the public APTOS and EyePACS datasets and reached a quadratic weighted kappa of 0.84. " +
      "I used temperature scaling to cut the expected calibration error from 0.11 to 0.03, and I made Grad-CAM heatmaps that an ophthalmology student checked. " +
      "These are the same steps this project asks for. My CGPA is not my strongest point, but I have already built the kind of work this project needs. " +
      "I would like to repeat it on a public fundus dataset under Prof. Chua and write it up properly.",
    proposal: NONE, // Student 2 does not self-propose in the demo
    revisedProposal: NONE,
  },
};

/** What the supervisor types when they decline Student 2's first proposal. */
export const DEMO_DECLINE_PROPOSAL = "Too broad. Pick one dataset and one question, and show a small experiment you have already run. Then send it again.";

/** The extra project the supervisor creates live, only to show the create-project flow. Students do not apply to it.
 *  Prerequisites are left empty on purpose. */
export const DEMO_NEW_PROJECT = {
  title: "Graph Learning for Traffic Forecasting",
  description:
    "Build a graph neural network that predicts traffic speeds across Singapore's road network 15 to 60 minutes ahead. You will turn LTA DataMall sensor " +
    "readings into a road graph, train a spatio-temporal GNN (such as STGCN or Graph WaveNet) in PyTorch Geometric, and compare it with LSTM and " +
    "historical-average baselines. Expected outcome: a trained model, an evaluation report on MAE and RMSE across peak and off-peak hours, and a short " +
    "demo map of the predictions.",
  tags: ["Machine Learning", "Deep Learning", "Transportation", "Data Science"],
  location: "N4-02c Lab",
  slots: 2,
  outcomes: [
    "Clean and map LTA traffic sensor data onto a road graph",
    "Train and tune a spatio-temporal GNN",
    "Benchmark against LSTM and historical-average baselines",
    "Write a short report and build a prediction map demo",
  ].join("\n"),
  skills: "PyTorch Geometric, time-series modelling, model evaluation, scientific writing",
  hours: "8",
  mode: "hybrid",
  video: "https://www.youtube.com/watch?v=WEWq93tioC4", // Friendly Introduction to Temporal Graph Neural Networks (and some Traffic Forecasting)
  cover: "/demo/cover-traffic.jpg",
};
