"""Slice A. Supabase-mode sign-in checks the password on its own client (REQ-AUTH-1). No network: fake client."""

from app.routers import auth as auth_router
from app.settings import get_settings

SERVICE_KEY = "service-role-key"


class FakeAuth:
    def __init__(self, owner: "FakeClient"):
        self.owner = owner

    def sign_in_with_password(self, creds):
        self.owner.sign_ins.append(creds["email"])
        if creds["password"] != "password":
            raise Exception("Invalid login credentials")
        # What supabase-py does: the client's later DB calls run as the signed-in user.
        self.owner.headers["Authorization"] = "Bearer user-access-token"


class FakeClient:
    def __init__(self, url: str, key: str, options=None):
        self.headers = {"Authorization": f"Bearer {key}"}
        self.sign_ins: list[str] = []
        self.auth = FakeAuth(self)


def supabase_mode(monkeypatch, fresh_store) -> tuple[FakeClient, list[FakeClient]]:
    settings = get_settings()
    monkeypatch.setattr(settings, "api_mode", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", SERVICE_KEY)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    shared = FakeClient(settings.supabase_url, SERVICE_KEY)
    monkeypatch.setattr(fresh_store, "client", shared, raising=False)
    created: list[FakeClient] = []

    def fake_create_client(url, key, options=None):
        c = FakeClient(url, key, options)
        created.append(c)
        return c

    monkeypatch.setattr(auth_router, "create_client", fake_create_client)
    return shared, created


def test_REQ_AUTH_1_sign_in_keeps_shared_client_on_service_key(anon, fresh_store, monkeypatch):
    shared, created = supabase_mode(monkeypatch, fresh_store)
    r = anon.post("/auth/sign-in", json={"email": "weiling001@e.ntu.edu.sg", "password": "password"})
    assert r.status_code == 200
    assert shared.headers["Authorization"] == f"Bearer {SERVICE_KEY}"
    assert shared.sign_ins == []
    assert [c.sign_ins for c in created] == [["weiling001@e.ntu.edu.sg"]]


def test_REQ_AUTH_1_supabase_wrong_password_rejected(anon, fresh_store, monkeypatch):
    shared, _ = supabase_mode(monkeypatch, fresh_store)
    r = anon.post("/auth/sign-in", json={"email": "weiling001@e.ntu.edu.sg", "password": "wrong"})
    assert r.status_code == 401 and r.json()["code"] == "bad_credentials"
    assert shared.headers["Authorization"] == f"Bearer {SERVICE_KEY}"
