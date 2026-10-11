"""
Firebase Admin SDK Client for FindBack Python API
==================================================

Used ONLY on the backend to:
- Verify Firebase Auth ID tokens sent by the frontend
- Fetch reports from Cloud Firestore
- Save calculated match scores into Cloud Firestore
- Check Firebase connectivity for /api/health
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import firebase_admin
    from firebase_admin import auth as fb_auth, credentials, firestore as fb_firestore
    HAVE_FIREBASE_ADMIN = True
except ImportError:
    HAVE_FIREBASE_ADMIN = False

from .config import Settings

ITEM_FIELDS = ["id", "type", "title", "description", "category", "color", "brand", "location", "date", "status", "user_id"]


class FirebaseClientError(Exception):
    def __init__(self, status: int, message: str, code: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


class FirebaseAdminClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._app: Optional[Any] = None
        self._db: Optional[Any] = None

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.firebase_project_id or self.settings.firebase_credentials_path)

    def _ensure_app(self) -> Any:
        if not HAVE_FIREBASE_ADMIN:
            raise FirebaseClientError(503, "firebase-admin package is not installed in the Python environment.", "not_installed")
        if not self.is_configured:
            raise FirebaseClientError(503, "Firebase is not configured for the Python API. Set FIREBASE_PROJECT_ID or FIREBASE_CREDENTIALS_PATH.", "not_configured")

        if self._app is not None:
            return self._app

        # Check existing apps
        try:
            self._app = firebase_admin.get_app("findback")
            return self._app
        except ValueError:
            pass

        cred_path = self.settings.firebase_credentials_path
        project_id = self.settings.firebase_project_id

        if cred_path and Path(cred_path).is_file():
            cred = credentials.Certificate(cred_path)
            self._app = firebase_admin.initialize_app(cred, name="findback")
        elif project_id:
            # When running without service account JSON, initialize with project ID for token verification
            self._app = firebase_admin.initialize_app(options={"projectId": project_id}, name="findback")
        else:
            self._app = firebase_admin.initialize_app(name="findback")

        return self._app

    @property
    def db(self) -> Any:
        if self._db is None:
            app = self._ensure_app()
            self._db = fb_firestore.client(app=app)
        return self._db

    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify Firebase ID token and return user info dict {'id': uid, 'email': email}."""
        app = self._ensure_app()
        try:
            decoded = fb_auth.verify_id_token(token, app=app)
            return {"id": decoded.get("uid"), "email": decoded.get("email")}
        except Exception as exc:
            raise FirebaseClientError(401, f"Invalid or expired Firebase token: {str(exc)}", "invalid_token") from exc

    def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Fetch item document from Firestore."""
        try:
            doc_ref = self.db.collection("items").document(item_id)
            doc = doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict() or {}
            data["id"] = doc.id
            return {f: data.get(f) for f in ITEM_FIELDS}
        except Exception as exc:
            raise FirebaseClientError(502, f"Could not read from Firestore: {str(exc)}", "firestore_error") from exc

    def list_open_items(self, item_type: str, limit: int = 500) -> List[Dict[str, Any]]:
        """Fetch open items of specified type from Firestore."""
        try:
            query = (
                self.db.collection("items")
                .where("type", "==", item_type)
                .where("status", "==", "open")
                .limit(limit)
            )
            items = []
            for doc in query.stream():
                data = doc.to_dict() or {}
                data["id"] = doc.id
                items.append({f: data.get(f) for f in ITEM_FIELDS})
            return items
        except Exception as exc:
            raise FirebaseClientError(502, f"Could not list open items from Firestore: {str(exc)}", "firestore_error") from exc

    def save_matches(self, item_id: str, matches: List[Dict[str, Any]]) -> int:
        """Save suggested matches to Firestore 'matches' collection and remove old matches for this item."""
        try:
            batch = self.db.batch()
            matches_coll = self.db.collection("matches")

            # Find existing matches involving this item
            q1 = matches_coll.where("lost_item_id", "==", item_id).stream()
            q2 = matches_coll.where("found_item_id", "==", item_id).stream()
            seen_ids = set()
            for doc in list(q1) + list(q2):
                if doc.id not in seen_ids:
                    seen_ids.add(doc.id)
                    batch.delete(doc.reference)

            # Insert new matches
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            for m in matches:
                ref = matches_coll.document()
                batch.set(ref, {
                    "lost_item_id": m.get("lost_item_id"),
                    "found_item_id": m.get("found_item_id"),
                    "score": m.get("score"),
                    "reasons": m.get("reasons", []),
                    "breakdown": m.get("breakdown", []),
                    "created_at": now,
                    "updated_at": now,
                })

            batch.commit()
            return len(matches)
        except Exception as exc:
            raise FirebaseClientError(502, f"Could not save matches to Firestore: {str(exc)}", "firestore_error") from exc

    def ping(self) -> str:
        """Check Firestore connectivity. Returns '' on success, error message on failure."""
        if not self.is_configured:
            return "Firebase not configured."
        try:
            list(self.db.collection("items").limit(1).stream())
            return ""
        except Exception as exc:
            return str(exc)
