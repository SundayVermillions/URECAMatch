"""seed_auth.py

Provisions Supabase Auth (auth.users) with pre-confirmed accounts matching
the mock user records defined in app.db.seed_data.
Requires the SUPABASE_SERVICE_ROLE_KEY (admin privileges).
"""

from __future__ import annotations

import os
import sys

from supabase import Client, create_client

from app.db import seed_data
from app.settings import get_settings


def get_admin_client() -> Client:
    settings = get_settings()
    url = os.getenv("SUPABASE_URL") or settings.supabase_url
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or getattr(settings, "supabase_service_role_key", None)

    if not url or not key:
        print(
            "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.",
            file=sys.stderr,
        )
        sys.exit(1)

    return create_client(url, key)


def seed_supabase_auth() -> None:
    client = get_admin_client()
    data = seed_data.build()
    users = data["users"]
    default_password = "password"

    print(f"Loaded {len(users)} users from seed_data. Provisioning Supabase Auth...")

    # Fetch existing users to make the script idempotent (safe to re-run)
    try:
        existing = client.auth.admin.list_users()
        existing_emails = {u.email: u.id for u in existing if u.email}
    except Exception as exc:
        print(f"Failed to query existing auth users: {exc}", file=sys.stderr)
        existing_emails = {}

    created_count = 0
    skipped_count = 0

    for user in users:
        if user.email in existing_emails:
            print(f"  [SKIPPED] {user.email} (already exists with ID: {existing_emails[user.email]})")
            skipped_count += 1
            continue

        try:
            role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
            res = client.auth.admin.create_user(
                {
                    "email": user.email,
                    "password": default_password,
                    "email_confirm": True,
                    "user_metadata": {
                        "name": user.name,
                        "role": role_val,
                        "legacy_id": user.id,
                    },
                }
            )
            created_user_id = getattr(res, "user", res).id
            print(f"  [CREATED] {user.email} -> auth.uid: {created_user_id}")
            created_count += 1
        except Exception as exc:
            print(f"  [ERROR] Failed to create {user.email}: {exc}", file=sys.stderr)

    print(f"\nDone! Created: {created_count}, Skipped: {skipped_count}")


if __name__ == "__main__":
    seed_supabase_auth()
