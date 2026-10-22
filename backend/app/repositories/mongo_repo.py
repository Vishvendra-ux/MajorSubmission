from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MongoMetadataRepository:
    """
    Modular repository for document-oriented ingestion records:
    - document_processing_records
    - extracted_document_sections
    - ingestion_errors
    - processing_metadata

    Uses MongoDB when reachable, or a documented JSON collection store fallback in local dev/test
    when MongoDB is unavailable and ALLOW_DEV_MONGO_FALLBACK=true.
    """

    COLLECTIONS = (
        "document_processing_records",
        "extracted_document_sections",
        "ingestion_errors",
        "processing_metadata",
    )

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client: Any = None
        self._db: Any = None
        self._checked = False
        self._using_fallback = False
        self._status_message = "Not initialized"

    def _ensure_initialized(self) -> None:
        if self._checked:
            return
        with self._lock:
            if self._checked:
                return
            settings = get_settings()
            try:
                from pymongo import MongoClient

                client: Any = MongoClient(
                    settings.MONGODB_URI,
                    serverSelectionTimeoutMS=1000,
                    connectTimeoutMS=1000,
                )
                client.admin.command("ping")
                self._client = client
                self._db = client[settings.MONGODB_DB_NAME]
                self._using_fallback = False
                self._status_message = f"Connected to MongoDB ({settings.MONGODB_DB_NAME})."
                logger.info("Connected to MongoDB at %s", settings.MONGODB_URI)
            except Exception as exc:
                if not settings.ALLOW_DEV_MONGO_FALLBACK:
                    raise
                self._client = None
                self._db = None
                self._using_fallback = True
                fallback_dir = Path(settings.DEV_MONGO_FALLBACK_DIR)
                fallback_dir.mkdir(parents=True, exist_ok=True)
                self._status_message = (
                    "MongoDB service unreachable on host; using documented local JSON collection "
                    f"fallback at {fallback_dir}."
                )
                logger.warning("MongoDB unreachable (%s). Using local JSON fallback.", exc)
            self._checked = True

    def get_status(self) -> Dict[str, Any]:
        self._ensure_initialized()
        return {
            "active_backend": "local_json_fallback" if self._using_fallback else "mongodb",
            "using_dev_fallback": self._using_fallback,
            "collections": list(self.COLLECTIONS),
            "status_message": self._status_message,
        }

    def _fallback_path(self, collection: str) -> Path:
        settings = get_settings()
        base = Path(settings.DEV_MONGO_FALLBACK_DIR)
        base.mkdir(parents=True, exist_ok=True)
        return base / f"{collection}.json"

    def _read_fallback_collection(self, collection: str) -> List[Dict[str, Any]]:
        path = self._fallback_path(collection)
        if not path.exists():
            return []
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _write_fallback_collection(self, collection: str, items: List[Dict[str, Any]]) -> None:
        path = self._fallback_path(collection)
        path.write_text(json.dumps(items, indent=2, default=str), encoding="utf-8")

    def save_processing_record(
        self,
        document_id: str,
        organisation_id: str,
        record: Dict[str, Any],
    ) -> None:
        self._ensure_initialized()
        payload = {
            **record,
            "document_id": document_id,
            "organisation_id": organisation_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if not self._using_fallback and self._db is not None:
            self._db["document_processing_records"].update_one(
                {"document_id": document_id, "organisation_id": organisation_id},
                {"$set": payload},
                upsert=True,
            )
            return

        with self._lock:
            items = self._read_fallback_collection("document_processing_records")
            items = [
                x
                for x in items
                if not (
                    x.get("document_id") == document_id
                    and x.get("organisation_id") == organisation_id
                )
            ]
            items.append(payload)
            self._write_fallback_collection("document_processing_records", items)

    def save_extracted_sections(
        self,
        document_id: str,
        organisation_id: str,
        sections: List[Dict[str, Any]],
        metadata: Dict[str, Any],
    ) -> None:
        self._ensure_initialized()
        now_iso = datetime.now(timezone.utc).isoformat()
        section_doc = {
            "document_id": document_id,
            "organisation_id": organisation_id,
            "sections": sections,
            "section_count": len(sections),
            "updated_at": now_iso,
        }
        meta_doc = {
            "document_id": document_id,
            "organisation_id": organisation_id,
            **metadata,
            "updated_at": now_iso,
        }
        if not self._using_fallback and self._db is not None:
            self._db["extracted_document_sections"].update_one(
                {"document_id": document_id, "organisation_id": organisation_id},
                {"$set": section_doc},
                upsert=True,
            )
            self._db["processing_metadata"].update_one(
                {"document_id": document_id, "organisation_id": organisation_id},
                {"$set": meta_doc},
                upsert=True,
            )
            return

        with self._lock:
            sec_items = [
                x
                for x in self._read_fallback_collection("extracted_document_sections")
                if not (
                    x.get("document_id") == document_id
                    and x.get("organisation_id") == organisation_id
                )
            ]
            sec_items.append(section_doc)
            self._write_fallback_collection("extracted_document_sections", sec_items)

            meta_items = [
                x
                for x in self._read_fallback_collection("processing_metadata")
                if not (
                    x.get("document_id") == document_id
                    and x.get("organisation_id") == organisation_id
                )
            ]
            meta_items.append(meta_doc)
            self._write_fallback_collection("processing_metadata", meta_items)

    def record_ingestion_error(
        self,
        document_id: str,
        organisation_id: str,
        stage: str,
        error_message: str,
    ) -> None:
        self._ensure_initialized()
        err_doc = {
            "document_id": document_id,
            "organisation_id": organisation_id,
            "stage": stage,
            "error_message": error_message,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not self._using_fallback and self._db is not None:
            self._db["ingestion_errors"].insert_one(err_doc)
            return

        with self._lock:
            items = self._read_fallback_collection("ingestion_errors")
            items.append(err_doc)
            self._write_fallback_collection("ingestion_errors", items)

    def get_extracted_sections(
        self, document_id: str, organisation_id: str
    ) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        if not self._using_fallback and self._db is not None:
            doc = self._db["extracted_document_sections"].find_one(
                {"document_id": document_id, "organisation_id": organisation_id},
                {"_id": 0},
            )
            return doc

        with self._lock:
            for item in self._read_fallback_collection("extracted_document_sections"):
                if (
                    item.get("document_id") == document_id
                    and item.get("organisation_id") == organisation_id
                ):
                    return item
        return None

    def get_processing_metadata(
        self, document_id: str, organisation_id: str
    ) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        if not self._using_fallback and self._db is not None:
            doc = self._db["processing_metadata"].find_one(
                {"document_id": document_id, "organisation_id": organisation_id},
                {"_id": 0},
            )
            return doc

        with self._lock:
            for item in self._read_fallback_collection("processing_metadata"):
                if (
                    item.get("document_id") == document_id
                    and item.get("organisation_id") == organisation_id
                ):
                    return item
        return None

    def delete_document_records(self, document_id: str, organisation_id: str) -> None:
        self._ensure_initialized()
        if not self._using_fallback and self._db is not None:
            for col in self.COLLECTIONS:
                self._db[col].delete_many(
                    {"document_id": document_id, "organisation_id": organisation_id}
                )
            return

        with self._lock:
            for col in self.COLLECTIONS:
                items = [
                    x
                    for x in self._read_fallback_collection(col)
                    if not (
                        x.get("document_id") == document_id
                        and x.get("organisation_id") == organisation_id
                    )
                ]
                self._write_fallback_collection(col, items)


mongo_repo = MongoMetadataRepository()
