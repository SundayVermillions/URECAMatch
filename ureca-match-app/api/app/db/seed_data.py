"""Single source of demo data.

Used by: the in-memory mock store (API_MODE=mock), `python -m app.db.export`
which writes web/lib/mock/seed.json and supabase/seed.sql.

Timeline (AY26/27 S1): cycle opens 18 Aug 2026, 7-day pre-application window,
three rounds of 5-day application + 2-day review. DEMO_NOW (settings) sits in
Round 2's application window so every screen has something to show.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

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
    "EEE": ["EE2004", "EE3080", "EE4483", "SC1015"],
    "SBS": ["SB2210", "SB3101", "SB3211"],
    "MAE": ["MA2007", "MA3005", "MA4826"],
    "SPMS": ["MH1810", "MH3511", "PH2104"],
    "NBS": ["AB1201", "AB2101", "BC2402"],
}
INTERESTS = [
    "Machine Learning",
    "Computer Vision",
    "HCI",
    "Healthcare AI",
    "Genomics",
    "Robotics",
    "NLP",
    "Statistics",
    "Explainable AI",
    "Energy Systems",
    "Materials",
    "Marine Biology",
]


def make_users() -> tuple[list[User], list[StudentProfile], list[SupervisorProfile]]:
    users: list[User] = []
    students: list[StudentProfile] = []
    supervisors: list[SupervisorProfile] = []
    for uid, name, email in ADMINS:
        users.append(User(id=uid, email=email, name=name, role=Role.admin, status=AccountStatus.active, created_at=dt(1, 7)))
    for uid, name, email, faculty in SUPERVISORS:
        users.append(User(id=uid, email=email, name=name, role=Role.supervisor, status=AccountStatus.active, created_at=dt(3, 7)))
        supervisors.append(SupervisorProfile(user_id=uid, faculty=faculty))
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
                        file_size=rng.randint(180_000, 900_000),
                        uploaded_at=dt(12 + i % 6, 8),
                    ),
                    Document(
                        id=f"doc-{uid}-cv",
                        owner_id=uid,
                        file_name=f"CV_{name.replace(' ', '')}.pdf",
                        file_size=rng.randint(80_000, 400_000),
                        uploaded_at=dt(12 + i % 6, 8),
                    ),
                ],
            )
        )
    return users, students, supervisors


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
                # REQ-EXEC-4, REQ-PUB-3: the system runs matching when review closes and publishes when approval closes
                executed_at=rev_end + timedelta(seconds=1) if n == 1 else None,
                published_at=rev_end + timedelta(days=2, seconds=1) if n == 1 else None,
                eligible_students=32 if n == 2 else 0,
                open_slots=14 if n == 2 else 0,
                reopened_slots=2 if n == 2 else 0,
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
    """A completed prior cycle, kept so admins can browse history and reopen one if needed."""
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
                eligible_students=0,
                open_slots=0,
                reopened_slots=0,
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
        "cover-chat",
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
        ["SB2210"],
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
        ["SB3101"],
        ["Genomics"],
        2,
        "SBS",
        "SBS-02n-15",
        "cover-leaf",
    ),
    (
        "lst-6",
        "sup-3",
        "Solid-State Battery Degradation Modelling",
        "Fit physics-informed degradation models to cycling data and predict remaining useful life for a lab cell.",
        ["EE3080"],
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
        ["EE4483", "SC1015"],
        ["Machine Learning", "Healthcare AI"],
        2,
        "EEE",
        "S2-B4a-03",
        "cover-eye",
    ),
    (
        "lst-8",
        "sup-4",
        "Human-Robot Collaboration in Assistive Environments",
        "Study handover strategies between a collaborative arm and a human in a mock kitchen, measuring safety and comfort.",
        ["MA3005"],
        ["Robotics", "HCI"],
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
        ["Robotics", "Materials"],
        1,
        "MAE",
        "N3-01a-05",
        "cover-robot",
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
        "cover-atom",
    ),
    (
        "lst-11",
        "sup-6",
        "NLP for Low-Resource Southeast Asian Languages",
        "Adapt a multilingual transformer to Malay and Tamil news text with a small annotated corpus and evaluate transfer.",
        ["SC4002"],
        ["NLP", "Machine Learning"],
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
        "cover-leaf",
    ),
]


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


def build() -> dict:
    rng.seed(2006)  # restart the sequence so every build() gives identical data, whatever ran before
    users, students, supervisors = make_users()
    cycle = make_cycle()
    listings = make_listings()
    return {
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
