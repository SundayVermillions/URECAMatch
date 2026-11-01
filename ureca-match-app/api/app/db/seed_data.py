"""Single source of demo data.

Used by: the in-memory mock store (API_MODE=mock), `python -m app.db.export`
which writes web/lib/mock/seed.json and supabase/seed.sql.

The templates use the original September test timeline. build() shifts the active
cycle to the demo anchor: Round 2 opens 3 Nov 2026 at 17:00 SGT. Window lengths
and round spacing stay the same; the closed historical cycle keeps its dates.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from app.demo import DEMO_NOW, DEMO_OFFSET
from app.models import (
    AccountStatus,
    Application,
    ApplicationStatus,
    AuditEntry,
    AuditOperation,
    Cycle,
    CycleStatus,
    Document,
    Listing,
    ListingMode,
    ListingStatus,
    Match,
    MatchStatus,
    Notification,
    NotificationEvent,
    Proposal,
    ProposalStatus,
    Role,
    Round,
    RoundStatus,
    StudentProfile,
    SupervisorProfile,
    User,
)
from app.services.audit import SYSTEM
from app.services.titles import split_title
from app.services.windows import when
from app.settings import get_settings

rng = random.Random(2006)


def dt(day: int, month: int = 8, hour: int = 9) -> datetime:
    return datetime(2026, month, day, hour, 0, tzinfo=UTC)


# ---------------------------------------------------------------- users

ADMINS = [
    ("adm-1", "Jonathan Teo", "jonathan.teo@ntu.edu.sg"),
    ("adm-2", "Priscilla Lim", "priscilla.lim@ntu.edu.sg"),
    ("adm-3", "Wei Kiat Ong", "weikiat.ong@ntu.edu.sg"),
]

SUPERVISORS = [
    ("sup-1", "Prof. Marcus Chua", "marcus.chua@ntu.edu.sg", "CCDS"),
    ("sup-2", "Prof. Daniel Ho", "daniel.ho@ntu.edu.sg", "SBS"),
    ("sup-3", "Assoc. Prof. Mei Lin Tan", "meilin.tan@ntu.edu.sg", "EEE"),
    ("sup-4", "Dr. Rajesh Kumar", "rajesh.kumar@ntu.edu.sg", "MAE"),
    ("sup-5", "Prof. Sarah Goh", "sarah.goh@ntu.edu.sg", "SPMS"),
    ("sup-6", "Dr. Hafiz Rahman", "hafiz.rahman@ntu.edu.sg", "CCDS"),
]

FIRST = [
    "Wei Ling",
    "Bryan",
    "Aisha",
    "Daniel",
    "Priya",
    "Jason",
    "Hui Min",
    "Arjun",
    "Chloe",
    "Kelvin",
    "Nurul",
    "Marcus",
    "Rachel",
    "Ethan",
    "Siti",
    "Ryan",
    "Xin Yi",
    "Darren",
    "Farah",
    "Isaac",
    "Mei Ling",
    "Zhi Hao",
    "Ananya",
    "Joel",
    "Nadia",
    "Kai Wen",
    "Shreya",
    "Timothy",
    "Yi Xuan",
    "Amir",
    "Cheryl",
    "Jun Jie",
    "Divya",
    "Lucas",
    "Hannah",
    "Wen Jun",
    "Kavya",
    "Gabriel",
    "Li Ting",
    "Adam",
]
LAST = [
    "Tan",
    "Koh",
    "Rahman",
    "Ng",
    "Menon",
    "Lim",
    "Chua",
    "Patel",
    "Lim",
    "Ong",
    "Aisyah",
    "Lee",
    "Ong",
    "Wong",
    "Nurhaliza",
    "Teo",
    "Chen",
    "Goh",
    "Ismail",
    "Loh",
    "Yeo",
    "Zhang",
    "Sharma",
    "Lau",
    "Hassan",
    "Sim",
    "Iyer",
    "Chan",
    "Toh",
    "Abdullah",
    "Low",
    "Heng",
    "Nair",
    "Ho",
    "Seah",
    "Foo",
    "Reddy",
    "Yap",
    "Poh",
    "Halim",
]
SCHOOLS = ["CCDS", "CCDS", "CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS"]
MODULES_BY_SCHOOL = {
    "CCDS": ["SC1015", "SC2001", "SC3020", "SC4001", "SC4002", "CE4041"],
    "EEE": ["EE2101", "EE3015", "EE4285", "SC1015"],
    "SBS": ["BS2004", "BS3008", "BS2030"],
    "MAE": ["MA2007", "MA3005", "MA4012"],
    "SPMS": ["MH1810", "MH3511", "PH2104"],
    "NBS": ["AB1201", "AB1202", "BC2402"],
}
INTERESTS = [
    "Machine Learning",
    "Computer Vision",
    "Human-Computer Interaction",
    "Healthcare AI",
    "Genomics",
    "Robotics",
    "Natural Language Processing",
    "Statistics",
    "Explainable AI",
    "Energy Systems",
    "Materials Science",
    "Marine Biology",
]


# Wei Ling (stu-1) is the demo's strong-fit applicant with a modest CGPA: her transcript and CV are real files, so they
# open in the viewer and the AI match can read the CV. The PDFs live in app/db/demo_docs.
DEMO_TRANSCRIPT = {"file_size": 19304, "storage_path": "stu-1/Transcript_WeiLingTan.pdf"}
DEMO_CV = {"file_size": 4000, "storage_path": "stu-1/CV_WeiLingTan.pdf"}
DEMO_MODULES = ["CC0001", "CC0003", "CC0015", "CE4041", "EG1001", "MH1812", "SC1003", "SC1004", "SC1005", "SC1006", "SC1007", "SC1008", "SC1013", "SC1015", "SC2000", "SC2001", "SC2002", "SC2005", "SC2006", "SC3000", "SC3010", "SC3020", "SC4001", "SC4002"]


def make_users() -> tuple[list[User], list[StudentProfile], list[SupervisorProfile]]:
    users: list[User] = []
    students: list[StudentProfile] = []
    supervisors: list[SupervisorProfile] = []
    for uid, name, email in ADMINS:
        users.append(User(id=uid, email=email, name=name, role=Role.admin, status=AccountStatus.active, created_at=dt(1, 7)))
    for uid, name, email, faculty in SUPERVISORS:
        users.append(User(id=uid, email=email, name=name, role=Role.supervisor, status=AccountStatus.active, created_at=dt(3, 7)))
        supervisors.append(SupervisorProfile(user_id=uid, faculty=faculty, title=split_title(name)[0]))
    for i in range(40):
        uid = f"stu-{i + 1}"
        name = f"{FIRST[i]} {LAST[i]}"
        email = f"{FIRST[i].lower().replace(' ', '')}{i + 1:03d}@e.ntu.edu.sg"
        school = SCHOOLS[i % len(SCHOOLS)]
        status = AccountStatus.inactive if i == 39 else AccountStatus.active
        users.append(User(id=uid, email=email, name=name, role=Role.student, status=status, created_at=dt(10 + i % 8, 8)))
        mods = MODULES_BY_SCHOOL[school]
        n = rng.randint(2, min(4, len(mods)))
        students.append(
            StudentProfile(
                user_id=uid,
                school=school,
                cgpa=round(rng.uniform(3.4, 4.9), 2),
                year_of_study=rng.choice([2, 3, 3, 4]),
                completed_modules=sorted(rng.sample(mods, n)),
                research_interests=rng.sample(INTERESTS, 2),
                profile_complete=i != 38,
                documents=[
                    Document(
                        id=f"doc-{uid}-t",
                        owner_id=uid,
                        file_name=f"Transcript_{name.replace(' ', '')}.pdf",
                        kind="transcript",
                        **({"file_size": rng.randint(180_000, 900_000)} | (DEMO_TRANSCRIPT if i == 0 else {})),
                        uploaded_at=dt(12 + i % 6, 8),
                    ),
                    Document(
                        id=f"doc-{uid}-cv",
                        owner_id=uid,
                        file_name=f"CV_{name.replace(' ', '')}.pdf",
                        **({"file_size": rng.randint(80_000, 400_000)} | (DEMO_CV if i == 0 else {})),
                        uploaded_at=dt(12 + i % 6, 8),
                    ),
                ],
            )
        )
    students[0].completed_modules = DEMO_MODULES  # the same modules her transcript shows
    students[0].research_interests = ["Deep Learning", "Machine Learning"]
    _add_document_text(students)
    return users, students, supervisors


def _add_document_text(students: list[StudentProfile]) -> None:
    """Seeded documents have no file, so give AI match words to read (REQ-VRANK-4). Uses no rng: the rest of the seed
    stays the same. Every fifth CV stands in for a scan. A document with a real file (the demo student's) is left alone, so
    AI match and the application tips read the actual PDF."""
    real = {DEMO_TRANSCRIPT["storage_path"], DEMO_CV["storage_path"]}
    for i, s in enumerate(students):
        focus, other = s.research_interests[0], s.research_interests[-1]
        for d in s.documents:
            if d.storage_path in real:
                continue
            if d.kind == "transcript":
                d.extracted_text = f"Cumulative GPA: {s.cgpa:.2f}\nCourses passed: {', '.join(s.completed_modules)}"
            elif i % 5:
                d.extracted_text = (
                    f"Curriculum vitae\nProjects: built a prototype on {focus} using Python and wrote a report on {other}.\n"
                    f"Experience: teaching assistant for a programming class in {s.school}.\nSkills: Python, Git, SQL."
                )
            else:
                d.extracted_text = ""


# ---------------------------------------------------------------- cycle

CYCLE_ID = "cyc-2627s1"


def make_cycle() -> Cycle:
    rounds: list[Round] = []
    cursor = dt(18) + timedelta(days=7)  # pre-application window: 18 to 24 Aug
    for n in range(1, 4):
        app_start = cursor
        app_end = app_start + timedelta(days=5) - timedelta(seconds=1)
        rev_start = app_start + timedelta(days=5)
        rev_end = rev_start + timedelta(days=2) - timedelta(seconds=1)
        status = {1: RoundStatus.published, 2: RoundStatus.application_window, 3: RoundStatus.scheduled}[n]
        rounds.append(
            Round(
                id=f"rnd-{n}",
                cycle_id=CYCLE_ID,
                number=n,
                application_start=app_start,
                application_end=app_end,
                review_start=rev_start,
                review_end=rev_end,
                approval_end=rev_end + timedelta(days=2),  # REQ-APPRV-4: two days for supervisors to decline
                status=status,
                # REQ-EXEC-6, REQ-PUB-4: the system runs matching when review closes and publishes when approval closes
                executed_at=rev_end + timedelta(seconds=1) if n == 1 else None,
                published_at=rev_end + timedelta(days=2, seconds=1) if n == 1 else None,
            )
        )
        cursor = rev_start + timedelta(days=2) + timedelta(days=4)  # 2-day approval window, then a 2-day gap
    return Cycle(
        id=CYCLE_ID,
        academic_year="AY26/27 Semester 1",
        opening_date=dt(18),
        closing_date=dt(2, 10),  # REQ-OUTCOME-3: 7 days after Round 3's approval window, for students to answer offers
        pre_application_days=7,
        status=CycleStatus.in_progress,
        rounds=rounds,
    )


def make_past_cycle() -> Cycle:
    """A completed prior cycle, kept so admins can browse history."""
    cid = "cyc-2526s2"
    rounds: list[Round] = []
    cursor = dt(5, 1) + timedelta(days=7)  # opens 5 Jan 2026, one pre-application week
    for n in range(1, 4):
        app_start = cursor
        app_end = app_start + timedelta(days=5) - timedelta(seconds=1)
        rev_start = app_start + timedelta(days=5)
        rev_end = rev_start + timedelta(days=2) - timedelta(seconds=1)
        rounds.append(
            Round(
                id=f"rnd-{cid}-{n}",
                cycle_id=cid,
                number=n,
                application_start=app_start,
                application_end=app_end,
                review_start=rev_start,
                review_end=rev_end,
                approval_end=rev_end + timedelta(days=2),
                status=RoundStatus.completed,
                executed_at=rev_end + timedelta(seconds=1),
                published_at=rev_end + timedelta(days=2, seconds=1),
            )
        )
        cursor = rev_start + timedelta(days=2) + timedelta(days=4)
    return Cycle(
        id=cid,
        academic_year="AY25/26 Semester 2",
        opening_date=dt(5, 1),
        closing_date=dt(20, 3),
        pre_application_days=7,
        status=CycleStatus.closed,
        rounds=rounds,
    )


# ---------------------------------------------------------------- listings

LISTINGS = [
    (
        "lst-1",
        "sup-1",
        "Deep Learning for Early Detection of Diabetic Retinopathy",
        "Build and validate a CNN pipeline for grading retinal images, with attention to clinician-facing explainability and calibration on a public fundus dataset.",
        ["SC4001"],
        ["Machine Learning", "Healthcare AI", "Computer Vision"],
        3,
        "CCDS",
        "N4-02c Lab",
        "cover-eye",
    ),
    (
        "lst-2",
        "sup-1",
        "Explainable AI for Clinical Decision Support",
        "Evaluate SHAP and counterfactual explanations for tabular clinical models against clinician feedback in a small user study.",
        ["SC4001"],
        ["Explainable AI", "Healthcare AI"],
        2,
        "CCDS",
        "N4-02c Lab",
        "cover-stethoscope",
    ),
    (
        "lst-3",
        "sup-1",
        "Federated Learning for Multi-Hospital Imaging Data",
        "Prototype a federated training loop across simulated hospital silos and measure the privacy and accuracy trade-off.",
        ["SC4001", "SC3020"],
        ["Machine Learning", "Healthcare AI"],
        2,
        "CCDS",
        "N4-02c Lab",
        "cover-atom",
    ),
    (
        "lst-4",
        "sup-2",
        "Microbiome Diversity in Tropical Coral Reefs",
        "Sequence and analyse microbial communities from reef samples collected off Pulau Hantu to link diversity with bleaching resilience.",
        ["BS2004"],
        ["Genomics", "Marine Biology"],
        2,
        "SBS",
        "SBS-02n-15",
        "cover-coral",
    ),
    (
        "lst-5",
        "sup-2",
        "CRISPR Screening for Antibiotic Resistance Genes",
        "Design a pooled CRISPR knockout screen to identify genes that change antibiotic sensitivity in E. coli.",
        ["BS3008"],
        ["Genomics"],
        2,
        "SBS",
        "SBS-02n-15",
        "cover-petri",
    ),
    (
        "lst-6",
        "sup-3",
        "Solid-State Battery Degradation Modelling",
        "Fit physics-informed degradation models to cycling data and predict remaining useful life for a lab cell.",
        ["EE3015"],
        ["Energy Systems", "Statistics"],
        3,
        "EEE",
        "S2-B4a-03",
        "cover-battery",
    ),
    (
        "lst-7",
        "sup-3",
        "Low-Power Edge Inference for Wearable ECG",
        "Quantise and deploy an arrhythmia classifier on a microcontroller, then measure latency and battery impact.",
        ["EE4285", "SC1015"],
        ["Machine Learning", "Healthcare AI"],
        2,
        "EEE",
        "S2-B4a-03",
        "cover-wearable",
    ),
    (
        "lst-8",
        "sup-4",
        "Human-Robot Collaboration in Assistive Environments",
        "Study handover strategies between a collaborative arm and a human in a mock kitchen, measuring safety and comfort.",
        ["MA3005"],
        ["Robotics", "Human-Computer Interaction"],
        2,
        "MAE",
        "N3-01a-05",
        "cover-robot",
    ),
    (
        "lst-9",
        "sup-4",
        "Soft Gripper Design for Delicate Produce",
        "Iterate silicone finger geometries and evaluate grasp success on fruit of varied firmness.",
        [],
        ["Robotics", "Materials Science"],
        1,
        "MAE",
        "N3-01a-05",
        "cover-gripper",
    ),
    (
        "lst-10",
        "sup-5",
        "Bayesian Methods for Sparse Sensor Networks",
        "Develop a hierarchical Bayesian model for missing readings in an air-quality network and validate on NEA data.",
        ["MH3511"],
        ["Statistics"],
        2,
        "SPMS",
        "SPMS-MAS-04-01",
        "cover-haze",
    ),
    (
        "lst-11",
        "sup-6",
        "NLP for Low-Resource Southeast Asian Languages",
        "Adapt a multilingual transformer to Malay and Tamil news text with a small annotated corpus and evaluate transfer.",
        ["SC4002"],
        ["Natural Language Processing", "Machine Learning"],
        2,
        "CCDS",
        "N4-02b Lab",
        "cover-chat",
    ),
    (
        "lst-12",
        "sup-6",
        "Fair Ranking in Recommender Systems",
        "Measure exposure disparity in a movie recommender and implement two re-ranking methods to reduce it.",
        ["SC3020"],
        ["Machine Learning", "Explainable AI"],
        2,
        "CCDS",
        "N4-02b Lab",
        "cover-cinema",
    ),
]


# Project details for every seeded listing, so the demo shows full project pages. Photos are real images from
# Wikimedia Commons in web/public/gallery (authors and licences in web/public/gallery/CREDITS.md).
def _g(lid: str, n: int) -> list[str]:
    return [f"/gallery/{lid}-{i}.jpg" for i in range(1, n + 1)]


DETAILS = {
    "lst-1": {
        "outcomes": "\n".join(
            [
                "Clean and split a public fundus dataset.",
                "Train a CNN grader and compare it with a baseline.",
                "Add saliency maps a clinician can read, and check calibration.",
                "Write a short report and present a poster.",
            ]
        ),
        "skills": "PyTorch, model evaluation, explainability methods, scientific writing",
        "hours_per_week": 8,
        "mode": ListingMode.hybrid,
        "gallery_urls": _g("lst-1", 3),
        "video_url": "https://www.youtube.com/watch?v=aircAruvnKk",
    },
    "lst-2": {
        "outcomes": "\n".join(
            [
                "Review explanation methods for tabular clinical data.",
                "Train a risk model on an open clinical dataset.",
                "Build a small decision-support prototype with SHAP and counterfactual views.",
                "Run a usability session with two clinicians and report what helped them.",
            ]
        ),
        "skills": "Explainable AI, user studies, Python, Streamlit",
        "hours_per_week": 6,
        "mode": ListingMode.on_site,
        "gallery_urls": _g("lst-2", 2),
    },
    "lst-3": {
        "outcomes": "\n".join(
            [
                "Simulate three hospital data silos from a public imaging dataset.",
                "Implement federated averaging and one privacy defence.",
                "Measure the accuracy and privacy trade-off.",
                "Present the results at the lab meeting.",
            ]
        ),
        "skills": "Federated learning, differential privacy, experiment design",
        "hours_per_week": 10,
        "mode": ListingMode.remote,
        "gallery_urls": _g("lst-3", 3),
    },
    "lst-4": {
        "outcomes": "\n".join(
            [
                "Join two field trips to collect coral and water samples off Pulau Hantu.",
                "Extract DNA and prepare 16S amplicon libraries.",
                "Analyse diversity with QIIME 2 and relate it to bleaching surveys.",
            ]
        ),
        "skills": "Field sampling, DNA extraction, bioinformatics, R",
        "hours_per_week": 10,
        "mode": ListingMode.on_site,
        "gallery_urls": _g("lst-4", 2),
    },
    "lst-5": {
        "outcomes": "\n".join(
            [
                "Design a guide RNA library against candidate resistance genes.",
                "Run the pooled knockout screen under two antibiotics.",
                "Count guides by sequencing and rank genes by effect.",
            ]
        ),
        "skills": "Molecular cloning, CRISPR screening, sequencing analysis, lab safety",
        "hours_per_week": 12,
        "mode": ListingMode.on_site,
        "gallery_urls": _g("lst-5", 2),
        "video_url": "https://www.youtube.com/watch?v=jAhjPd4uNFY",
    },
    "lst-6": {
        "outcomes": "\n".join(
            [
                "Clean cycling data from coin cells tested in the lab.",
                "Fit an equivalent-circuit model and a physics-informed degradation model.",
                "Predict remaining useful life and compare the two models.",
            ]
        ),
        "skills": "Battery modelling, Python, curve fitting, uncertainty estimation",
        "hours_per_week": 8,
        "mode": ListingMode.hybrid,
        "gallery_urls": _g("lst-6", 3),
    },
    "lst-7": {
        "outcomes": "\n".join(
            [
                "Train a small arrhythmia classifier on the MIT-BIH dataset.",
                "Quantise it and deploy it on a microcontroller.",
                "Measure latency, accuracy and battery drain on the board.",
            ]
        ),
        "skills": "Embedded C, TinyML, signal processing, power measurement",
        "hours_per_week": 8,
        "mode": ListingMode.on_site,
        "gallery_urls": _g("lst-7", 2),
    },
    "lst-8": {
        "outcomes": "\n".join(
            [
                "Program three handover strategies on a collaborative robot arm.",
                "Run a user study with 12 participants in the mock kitchen.",
                "Analyse safety and comfort ratings and write up the findings.",
            ]
        ),
        "skills": "ROS 2, robot programming, user study design, statistics",
        "hours_per_week": 10,
        "mode": ListingMode.on_site,
        "gallery_urls": _g("lst-8", 2),
    },
    "lst-9": {
        "outcomes": "\n".join(
            [
                "Design silicone finger geometries in CAD and cast them.",
                "Test grasp success on fruit of different firmness.",
            ]
        ),
        "skills": "CAD, moulding and casting, experimental testing",
        "hours_per_week": 8,
        "mode": ListingMode.on_site,
    },
    "lst-10": {
        "outcomes": "\n".join(
            [
                "Explore a year of air-quality readings and their missing values.",
                "Build a hierarchical Bayesian model for the gaps.",
                "Validate it against held-out NEA station data.",
            ]
        ),
        "skills": "Bayesian statistics, Stan or PyMC, spatial data, R or Python",
        "hours_per_week": 6,
        "mode": ListingMode.remote,
        "gallery_urls": _g("lst-10", 2),
    },
    "lst-11": {
        "outcomes": "\n".join(
            [
                "Annotate a small corpus of Malay and Tamil news headlines.",
                "Fine-tune a multilingual transformer on it.",
                "Test how well it transfers between the two languages.",
                "Release the corpus and a short report.",
            ]
        ),
        "skills": "NLP, Hugging Face Transformers, annotation design, evaluation",
        "hours_per_week": 8,
        "mode": ListingMode.hybrid,
        "gallery_urls": _g("lst-11", 3),
        "video_url": "https://www.youtube.com/watch?v=eMlx5fFNoYc",
    },
    "lst-12": {
        "outcomes": "\n".join(
            [
                "Train a baseline movie recommender on MovieLens.",
                "Measure how exposure is shared between popular and niche films.",
                "Implement two re-ranking methods and compare fairness and accuracy.",
            ]
        ),
        "skills": "Recommender systems, fairness metrics, PyTorch, experiment tracking",
        "hours_per_week": 6,
        "mode": ListingMode.remote,
        "gallery_urls": _g("lst-12", 2),
    },
}


def make_listings() -> list[Listing]:
    sup_names = {uid: name for uid, name, _, _ in SUPERVISORS}
    out = []
    for i, (lid, sid, title, desc, prereq, tags, slots, fac, loc, cover) in enumerate(LISTINGS):
        filled = {"lst-1": 1, "lst-4": 1, "lst-6": 2, "lst-9": 1}.get(lid, 0)
        status = ListingStatus.closed if lid == "lst-9" else ListingStatus.published
        out.append(
            Listing(
                id=lid,
                supervisor_id=sid,
                supervisor_name=sup_names[sid],
                title=title,
                description=desc,
                prerequisites=prereq,
                topic_tags=tags,
                available_slots=slots,
                filled_slots=filled,
                offering_faculty=fac,
                research_location=loc,
                cover_url=f"/covers/{cover}.jpg",
                **DETAILS.get(lid, {}),
                status=status,
                created_at=dt(5 + i % 10, 8),
            )
        )
    return out


# ---------------------------------------------------------------- applications, matches, proposals

STATEMENTS = [
    "I completed the prerequisite module last semester and built a related course project that reached 0.89 AUC on a held-out set. I am keen to take that further with real data and clinician feedback.",
    "My interest in this topic started during an internship where I worked on preprocessing pipelines for imaging data. I would like to move from data engineering into modelling under supervision.",
    "I have self-studied the core methods for a year and wrote a term paper on the evaluation problem in this area. This project sits exactly at the intersection of my background and my goals.",
    "I placed in the top 15 percent of a public competition on a closely related dataset, so I already understand its quirks. I want to apply that experience to a research question rather than a leaderboard.",
]


def make_applications(listings: list[Listing]) -> list[Application]:
    apps: list[Application] = []
    listing_by_id = {lst.id: lst for lst in listings}
    open_listings = [lst for lst in listings if lst.status == ListingStatus.published]
    counter = 0
    # Round 2 (current): students 1..32 apply to 2 to 4 listings each
    for i in range(1, 33):
        sid = f"stu-{i}"
        picks = rng.sample(open_listings, rng.randint(2, 4))
        for rank, lst in enumerate(picks, start=1):
            counter += 1
            apps.append(
                Application(
                    id=f"app-{counter}",
                    student_id=sid,
                    listing_id=lst.id,
                    listing_title=lst.title,
                    supervisor_name=lst.supervisor_name,
                    round_id="rnd-2",
                    statement=STATEMENTS[counter % len(STATEMENTS)],
                    submitted_at=dt(5, 9) + timedelta(hours=counter * 3),
                    preference_rank=rank,
                    status=ApplicationStatus.submitted,
                    document_ids=[f"doc-{sid}-t", f"doc-{sid}-cv"],
                )
            )
    # Round 1 (published): a few matched applications for students 33..38
    for i, lid in zip(range(33, 39), ["lst-1", "lst-4", "lst-6", "lst-6", "lst-9", "lst-2"], strict=True):
        counter += 1
        lst = listing_by_id[lid]
        apps.append(
            Application(
                id=f"app-{counter}",
                student_id=f"stu-{i}",
                listing_id=lid,
                listing_title=lst.title,
                supervisor_name=lst.supervisor_name,
                round_id="rnd-1",
                statement=STATEMENTS[i % len(STATEMENTS)],
                submitted_at=dt(26, 8) + timedelta(hours=i),
                preference_rank=1,
                status=ApplicationStatus.matched,
            )
        )
    return apps


def make_matches(users: list[User], listings: list[Listing]) -> list[Match]:
    name = {u.id: u.name for u in users}
    lst = {lst.id: lst for lst in listings}
    rows = [
        ("mt-1", "stu-33", "lst-1", MatchStatus.accepted),
        ("mt-2", "stu-34", "lst-4", MatchStatus.accepted),
        ("mt-3", "stu-35", "lst-6", MatchStatus.accepted),
        ("mt-4", "stu-36", "lst-6", MatchStatus.accepted),
        ("mt-5", "stu-37", "lst-9", MatchStatus.accepted),
        ("mt-6", "stu-38", "lst-2", MatchStatus.declined),
    ]
    out = []
    for mid, sid, lid, status in rows:
        out.append(
            Match(
                id=mid,
                round_id="rnd-1",
                student_id=sid,
                student_name=name[sid],
                listing_id=lid,
                listing_title=lst[lid].title,
                supervisor_id=lst[lid].supervisor_id,
                supervisor_name=lst[lid].supervisor_name,
                status=status,
                preference_rank=1,
                published_at=dt(3, 9),  # Round 1's approval window closed; nobody declined these (REQ-APPRV-4)
                offer_expires_at=dt(10, 9) - timedelta(seconds=1),  # end of Round 2's application window (REQ-OUTCOME-3)
                student_responded_at=dt(4, 9, 10),
            )
        )
    return out


def make_proposals(users: list[User]) -> list[Proposal]:
    name = {u.id: u.name for u in users}
    rows = [
        ("prp-1", "stu-3", "sup-2", "Metagenomic Survey of Mangrove Sediments", ProposalStatus.submitted),
        ("prp-2", "stu-9", "sup-1", "Self-Supervised Pretraining for Retinal OCT", ProposalStatus.submitted),
        ("prp-3", "stu-14", "sup-6", "Code-Switching Detection in Singlish Social Media", ProposalStatus.accepted),
        ("prp-4", "stu-21", "sup-4", "Tendon-Driven Finger for Prosthetic Hands", ProposalStatus.declined),
    ]
    out = []
    for pid, sid, sup, title, status in rows:
        out.append(
            Proposal(
                id=pid,
                student_id=sid,
                student_name=name[sid],
                supervisor_id=sup,
                supervisor_name=name[sup],
                title=title,
                description=(
                    "I propose a semester-long study with a clear deliverable: a dataset, a baseline model and an "
                    "evaluation report. I have already collected pilot data and would value supervision on method design."
                ),
                research_interests=rng.sample(INTERESTS, 2),
                statement=STATEMENTS[len(out) % len(STATEMENTS)],
                status=status,
                submitted_at=dt(6, 9) + timedelta(hours=len(out) * 7),
                decided_at=dt(8, 9) if status != ProposalStatus.submitted else None,
                decision_note=(
                    "The scope is too broad for one semester. Narrow it to a single dataset and resubmit."
                    if status == ProposalStatus.declined
                    else None
                ),
                document_ids=[f"doc-{sid}-t"],
            )
        )
    return out


def make_notifications() -> list[Notification]:
    return [
        Notification(
            id="ntf-1",
            user_id="stu-1",
            event=NotificationEvent.round_opened,
            title="Round 2 is open",
            message="Apply and rank your projects by 10 Sep, 5:00 pm SGT.",
            created_at=dt(5, 9, 8),
            read=True,
            link="/browse",
        ),
        Notification(
            id="ntf-2",
            user_id="stu-1",
            event=NotificationEvent.cycle_changed,
            title="Round 2 closes in 4 days",
            message="Applications close on 10 Sep at 5:00 pm SGT. Set your preference order in My applications before then.",
            created_at=dt(6, 9, 9),
            link="/my-applications",
        ),
        Notification(
            id="ntf-3",
            user_id="stu-33",
            event=NotificationEvent.offer_received,
            title="You have a match offer",
            message="Deep Learning for Early Detection of Diabetic Retinopathy. Respond by 10 Sep, 5:00 pm SGT.",
            created_at=dt(3, 9),
            link="/my-applications",
        ),
        Notification(
            id="ntf-4",
            user_id="sup-1",
            event=NotificationEvent.proposal_decided,
            title="New proposal from Aisha Rahman",
            message="Self-Supervised Pretraining for Retinal OCT is waiting for your decision.",
            created_at=dt(6, 9, 15),
            link="/proposals",
        ),
        Notification(
            id="ntf-5",
            user_id="sup-1",
            event=NotificationEvent.round_opened,
            title="Round 2 review window opens 10 Sep",
            message="Rankings are due 12 Sep, 5:00 pm SGT. You can start ranking applicants now.",
            created_at=dt(5, 9, 8),
            link="/projects",
        ),
        Notification(
            id="ntf-6",
            user_id="adm-1",
            event=NotificationEvent.results_published,
            title="Round 1 results published",
            message="3,912 students notified. 372 declined so far.",
            created_at=dt(3, 9),
            read=True,
            link="/rounds",
        ),
    ]


def make_audit() -> list[AuditEntry]:
    return [
        AuditEntry(
            id="aud-1",
            operation=AuditOperation.matching_executed,
            actor_id=SYSTEM.id,  # REQ-AUDIT-3
            actor_name=SYSTEM.name,
            timestamp=dt(1, 9),
            affected_records=["rnd-1"],
            note="Round 1 matching, 3.1 s",
        ),
        AuditEntry(
            id="aud-2",
            operation=AuditOperation.manual_reassignment,
            actor_id="adm-1",
            actor_name="Jonathan Teo",
            timestamp=dt(2, 9, 7),
            affected_records=["mt-4"],
            note="Supervisor declined; reassigned to second preference",
        ),
        AuditEntry(
            id="aud-3",
            operation=AuditOperation.results_published,
            actor_id=SYSTEM.id,
            actor_name=SYSTEM.name,
            timestamp=dt(3, 9),
            affected_records=["rnd-1"],
        ),
        AuditEntry(
            id="aud-4",
            operation=AuditOperation.user_deactivated,
            actor_id="adm-2",
            actor_name="Priscilla Lim",
            timestamp=dt(2, 9, 10),
            affected_records=["stu-40"],
            note="Withdrew from programme",
        ),
    ]


DEMO_PROJECT = "lst-1"  # Deep Learning for Early Detection of Diabetic Retinopathy
DEMO_PROJECT_MOVED_TO = "lst-3"  # where the earlier student's accepted match moves, so the account stu-33 keeps its offer history


def make_demo_project_fresh(data: dict) -> None:
    """DEMO_FRESH: nobody has applied to or been placed on the demo project, it has one slot, and no student has proposed
    anything yet, so the supervisors' Proposals page starts empty (demo set-up only)."""
    other = next(lst for lst in data["listings"] if lst.id == DEMO_PROJECT_MOVED_TO)
    demo = next(lst for lst in data["listings"] if lst.id == DEMO_PROJECT)
    for a in data["applications"]:
        if a.listing_id == DEMO_PROJECT and a.round_id == "rnd-1":  # the earlier placement moves to another project
            a.listing_id, a.listing_title, a.supervisor_name = other.id, other.title, other.supervisor_name
    for m in data["matches"]:
        if m.listing_id == DEMO_PROJECT:
            m.listing_id, m.listing_title, m.supervisor_id, m.supervisor_name = (
                other.id,
                other.title,
                other.supervisor_id,
                other.supervisor_name,
            )
    data["applications"] = [a for a in data["applications"] if a.listing_id != DEMO_PROJECT]
    data["proposals"] = []
    data["notifications"] = [n for n in data["notifications"] if n.id != "ntf-4"]  # "New proposal from ..." for a proposal that is gone
    demo.available_slots, demo.filled_slots = 1, 0
    other.filled_slots += 1
    ranks: dict[tuple[str, str], int] = {}
    for a in sorted(data["applications"], key=lambda x: (x.student_id, x.round_id, x.preference_rank or 99)):
        if a.status == ApplicationStatus.submitted:  # close the gaps so every student's preferences run 1, 2, 3
            ranks[(a.student_id, a.round_id)] = ranks.get((a.student_id, a.round_id), 0) + 1
            a.preference_rank = ranks[(a.student_id, a.round_id)]


def build(*, offset: timedelta = DEMO_OFFSET) -> dict:
    rng.seed(2006)  # restart the sequence so every build() gives identical data, whatever ran before
    users, students, supervisors = make_users()
    cycle = make_cycle()
    listings = make_listings()
    data = {
        "users": users,
        "students": students,
        "supervisors": supervisors,
        "cycle": cycle,
        "cycles": [make_past_cycle(), cycle],  # history, oldest first; at most one is not closed
        "listings": listings,
        "applications": make_applications(listings),
        "matches": make_matches(users, listings),
        "proposals": make_proposals(users),
        "notifications": make_notifications(),
        "audit": make_audit(),
    }
    if get_settings().demo_fresh:
        make_demo_project_fresh(data)
    if not offset:
        return data  # Tests may explicitly request the original September scenario.

    # REQ-CYCLE-1, REQ-ROUND-1: shift the complete active schedule, including offer deadlines.
    for row in [cycle, *cycle.rounds]:
        for field in type(row).model_fields:
            value = getattr(row, field)
            if isinstance(value, datetime):
                setattr(row, field, value + offset)

    events = [
        *users,
        *(doc for student in students for doc in student.documents),
        *listings,
        *data["applications"],
        *data["matches"],
        *data["proposals"],
        *data["notifications"],
        *data["audit"],
    ]
    for row in events:
        for field in type(row).model_fields:
            value = getattr(row, field)
            if isinstance(value, datetime):
                shifted = value + offset
                # Preloaded activity has already happened when the demo opens; deadlines remain in the future.
                setattr(row, field, shifted if field == "offer_expires_at" else min(shifted, DEMO_NOW))

    second = cycle.rounds[1]
    notices = {n.id: n for n in data["notifications"]}
    notices["ntf-1"].message = f"Apply and rank your projects by {when(second.application_end)}."
    notices["ntf-1"].created_at = second.application_start
    notices["ntf-2"].title = "Round 2 application deadline"
    notices[
        "ntf-2"
    ].message = f"Applications close {when(second.application_end)}. Set your preference order in My applications before then."
    notices[
        "ntf-3"
    ].message = f"Deep Learning for Early Detection of Diabetic Retinopathy. Respond by {when(second.application_end)}."
    notices["ntf-5"].title = f"Round 2 review opens {when(second.review_start)}"
    notices["ntf-5"].message = f"Rankings are due {when(second.review_end)}. You can start ranking applicants now."
    notices["ntf-5"].created_at = second.application_start
    return data
