"""Seed Supabase Auth with demo users from seed_data.

Run with:
    uv run python -m app.db.seed_auth
"""

from __future__ import annotations

import sys

from supabase import create_client

from app.db import seed_data
from app.settings import get_settings


def seed_auth() -> None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to seed auth.")
        sys.exit(1)

    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    data = seed_data.build()
    users = data["users"]

    print(f"[*] Seeding {len(users)} users into Supabase Auth...")
    success_count = 0

    for u in users:
        # Check if user already exists in Supabase Auth
        try:
            client.auth.admin.create_user(
                {
                    "id": u.id if len(u.id) == 36 else None,  # only pass id if valid UUID
                    "email": u.email,
                    "password": "password",
                    "email_confirm": True,
                    "user_metadata": {
                        "name": u.name,
                        "role": u.role.value,
                    },
                }
            )
            print(f"  [+] Created auth user: {u.email} ({u.role.value})")
            success_count += 1
        except Exception as e:
            err = str(e).lower()
            if "already registered" in err or "already exists" in err:
                print(f"  [=] User already registered: {u.email}")
                success_count += 1
            else:
                print(f"  [-] Failed to create {u.email}: {e}")

    print(f"[✓] Auth seeding complete. {success_count}/{len(users)} users ready with password 'password'.")


if __name__ == "__main__":
    seed_auth()
