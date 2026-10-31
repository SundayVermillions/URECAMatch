"""Fill an empty Supabase database with the demo data. Run by hand, never on server start.

    uv run python -m app.db.seed_db --yes

Rows that already exist are left alone (insert, on conflict do nothing), so running it twice changes nothing and
never overwrites live data. Supabase Auth accounts are a separate step: `uv run python -m app.db.seed_auth`.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from app.db import seed_data
from app.db.store import SupabaseStore
from app.models import AccountStatus, Role, User
from app.services.storage import DEMO_DOCS

CHUNK = 200  # rows per request

USER_COLUMNS = {"id", "email", "name", "role", "status", "created_at"}
DOCUMENT_COLUMNS = {"id", "owner_id", "file_name", "file_format", "file_size", "uploaded_at", "storage_path"}
NOTIFICATION_COLUMNS = {"id", "user_id", "event", "title", "message", "created_at", "read", "link"}


def _dump(items, include: set[str] | None = None, exclude: set[str] | None = None) -> list[dict]:
    return [i.model_dump(mode="json", include=include, exclude=exclude) for i in items]


def tables(data: dict) -> list[tuple[str, list[dict]]]:
    """Every table with its rows, parents before the tables that point at them."""
    system = User(
        id="system",
        email="system@urecamatch.app",
        name="System",
        role=Role.admin,
        status=AccountStatus.inactive,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    cycles = data["cycles"]
    rankings = [
        {"listing_id": key.split(":")[0], "round_id": key.split(":")[1], "application_ids": ids, "submitted_at": None}
        for key, ids in data.get("applicant_rankings", {}).items()
    ]
    return [
        ("users", _dump([system, *data["users"]], include=USER_COLUMNS)),
        ("student_profiles", _dump(data["students"], exclude={"documents"})),
        ("supervisor_profiles", _dump(data["supervisors"])),
        ("supporting_documents", _dump([d for s in data["students"] for d in s.documents], include=DOCUMENT_COLUMNS)),
        ("application_cycles", _dump(cycles, include=SupabaseStore._CYCLE_COLUMNS)),
        ("matching_rounds", _dump([r for c in cycles for r in c.rounds], include=SupabaseStore._ROUND_COLUMNS)),
        ("project_listings", _dump(data["listings"], include=SupabaseStore._LISTING_COLUMNS)),
        ("listing_applications", _dump(data["applications"], include=SupabaseStore._APPLICATION_COLUMNS)),
        ("applicant_rankings", rankings),
        ("self_proposed_applications", _dump(data["proposals"], include=SupabaseStore._PROPOSAL_COLUMNS)),
        ("match_results", _dump(data["matches"], include=SupabaseStore._MATCH_COLUMNS)),
        ("notifications", _dump(data["notifications"], include=NOTIFICATION_COLUMNS)),
        ("audit_log", _dump(data["audit"], include=SupabaseStore._AUDIT_COLUMNS)),
    ]


def seed_database(client: Any) -> dict[str, int]:
    """Insert whatever is missing. Returns the number of rows offered per table."""
    data = seed_data.build()
    data["applicant_rankings"] = {
        "lst-1:rnd-2": [a.id for a in data["applications"] if a.listing_id == "lst-1" and a.round_id == "rnd-2"][:4]
    }
    counts = {}
    for name, rows in tables(data):
        for i in range(0, len(rows), CHUNK):
            client.table(name).upsert(rows[i : i + CHUNK], ignore_duplicates=True).execute()
        counts[name] = len(rows)
    return counts


def upload_demo_documents(client: Any) -> None:
    """Put the real files of seeded documents (Wei Ling's CV) into Storage so the AI match can read them."""
    for s in seed_data.build()["students"]:
        for d in (d for d in s.documents if d.storage_path):
            src = DEMO_DOCS / d.storage_path.rsplit("/", 1)[-1]
            if src.is_file():
                options = {"content-type": "application/pdf", "upsert": "true"}
                client.storage.from_("documents").upload(d.storage_path, src.read_bytes(), file_options=options)


def main(argv: list[str] | None = None) -> int:
    from supabase import create_client

    from app.settings import get_settings

    args = sys.argv[1:] if argv is None else argv
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.")
        return 1
    host = urlparse(settings.supabase_url).netloc
    if "--yes" not in args:
        print(f"This inserts the demo rows that are missing into {host}. Existing rows are not changed.")
        print("Run again with --yes to go ahead.")
        return 1
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    counts = seed_database(client)
    upload_demo_documents(client)
    for name, n in counts.items():
        print(f"  {name}: {n} rows offered")
    print(f"Seeded {host}. Run `uv run python -m app.db.seed_auth` next to create the sign-in accounts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
