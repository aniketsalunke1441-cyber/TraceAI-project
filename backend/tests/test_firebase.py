"""Unit tests for Firebase Admin client and Firebase API endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.firebase_client import FirebaseAdminClient, FirebaseClientError
from app.main import create_app


def test_firebase_health_in_demo_mode():
    client = TestClient(create_app(Settings()))
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert "firebase" in body
    assert body["firebase"]["configured"] is False
    assert body["firebase"]["reachable"] is None


def test_firebase_client_not_configured():
    client = FirebaseAdminClient(Settings())
    assert client.is_configured is False
    assert client.ping() == "Firebase not configured."
    with pytest.raises(FirebaseClientError) as exc:
        client.verify_token("some-token")
    assert exc.value.status == 503
