/** The words and files the demo "Fill demo" button types in. Edit the text here; no other code needs to change.
 *  Story: Student 1 has the weaker CGPA but a specific statement and a portfolio full of evidence, so the AI score puts them first.
 *  Student 2 has the higher CGPA but a general statement and a thin portfolio. Their self-proposal is declined, then revised and accepted. */
export type DemoRole = "s1" | "s2";

export type DemoProposal = { title: string; description: string; interests: string[]; statement: string };

const NONE: DemoProposal = { title: "", description: "", interests: [], statement: "" };

export const DEMO: Record<DemoRole, {
  label: string;
  transcript: string;
  portfolio: string;
  interests: string[];
  applyStatement: string;
  proposal: DemoProposal;
  revisedProposal: DemoProposal;
}> = {
  s1: {
    label: "Student 1",
    transcript: "/demo/mock-transcript-student1-lower.pdf",
    portfolio: "/demo/portfolio-student1.pdf",
    interests: ["Machine Learning", "Healthcare AI", "Computer Vision", "Explainable AI"],
    applyStatement:
      "I trained a retinal grading model on the APTOS 2019 dataset as a personal project and reached a quadratic weighted kappa of 0.89. " +
      "I added Grad-CAM maps and checked them with a medical student, then cut the calibration error from 9.2% to 3.1% with temperature scaling. " +
      "These are the same steps this project asks for. I also spent a summer with an eye clinic's data team, so I know how clinicians read model output. " +
      "My CGPA is not my strongest point, but I have already built the kind of work this project needs. " +
      "I would like to repeat it on a public fundus dataset under Prof. Chua and write it up properly.",
    proposal: NONE, // Student 1 does not self-propose in the demo
    revisedProposal: NONE,
  },
  s2: {
    label: "Student 2",
    transcript: "/demo/mock-transcript-student2-higher.pdf",
    portfolio: "/demo/portfolio-student2.pdf",
    interests: ["Machine Learning", "Natural Language Processing"],
    applyStatement:
      "I am interested in artificial intelligence and did well in SC4001 Neural Network and Deep Learning. " +
      "I think this project is a good chance to learn more about deep learning in healthcare. " +
      "I am a hard working student and I am willing to learn whatever is needed to contribute to the project.",
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
        "I now have one dataset and one question, as you suggested. I took SC4001 and earned an A, and I can commit 8 hours a week. " +
        "I would like to work under you because your lab already works on explainable grading, so the calibration results would feed straight into it.",
    },
  },
};

/** What the supervisor types when they decline Student 2's first proposal. */
export const DEMO_DECLINE_PROPOSAL = "Too broad. Pick one dataset and one question, and show a small experiment you have already run. Then send it again.";

/** The extra project the supervisor creates live, only to show the create-project flow. Students do not apply to it. */
export const DEMO_NEW_PROJECT = {
  title: "Rooftop Farming: Sensing and Forecasting Crop Yield",
  description:
    "Build a low-cost sensor kit for a rooftop vegetable farm and use its readings to forecast yield. The student will log light, soil moisture and " +
    "temperature for one growing cycle, train a simple forecasting model, and compare its predictions with the harvest records kept by the farm.",
  tags: ["Sustainability", "Data Science", "Climate Science"],
  location: "N3-01 Green Systems Lab",
  outcomes: ["Build and place the sensor kit.", "Log one full growing cycle.", "Train and test a yield forecast.", "Share the findings with the farm."].join("\n"),
  skills: "Sensor logging, time series forecasting, data cleaning, working with a partner",
  hours: "6",
  mode: "on_site",
  video: "https://www.youtube.com/watch?v=aircAruvnKk",
  cover: "/covers/cover-haze.jpg",
};
