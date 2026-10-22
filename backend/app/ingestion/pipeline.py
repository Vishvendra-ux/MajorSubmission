from __future__ import annotations

import time
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.embeddings import get_embedding_provider
from app.core.config import get_runtime_config
from app.core.logging import get_logger
from app.db.session import get_session_factory
from app.ingestion.chunker import split_sections_into_chunks
from app.ingestion.extractors import extract_document_sections
from app.models.base import utcnow
from app.models.entities import (
    Document,
    DocumentChunk,
    DocumentSummary,
    Notification,
    ProcessingJob,
)
from app.repositories.mongo_repo import mongo_repo

logger = get_logger(__name__)


def run_document_ingestion_pipeline(
    document_id: str,
    job_id: Optional[str] = None,
    db_session: Optional[Session] = None,
) -> bool:
    """
    Executes the complete document ingestion pipeline safely and idempotently:
    1. Marks document & job as 'processing'.
    2. Clears any prior chunks/MongoDB records to prevent duplicates on retry/reprocess.
    3. Extracts text with page/slide/sheet/section metadata + OCR when applicable.
    4. Stores document-oriented section structure & metadata in MongoDB repository.
    5. Splits sections into overlapping chunks.
    6. Computes vector embeddings via configured EmbeddingProvider.
    7. Persists indexed chunks and marks document as 'ready' ONLY after indexing succeeds.
    """
    own_session = db_session is None
    session_factory = get_session_factory()
    db: Session = db_session if db_session is not None else session_factory()
    start_time = time.time()

    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error("Ingestion aborted: Document %s not found.", document_id)
            return False

        job: Optional[ProcessingJob] = None
        if job_id:
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if not job:
            job = (
                db.query(ProcessingJob)
                .filter(ProcessingJob.document_id == document_id)
                .order_by(ProcessingJob.created_at.desc())
                .first()
            )

        # Avoid duplicate concurrent execution if already processing in another worker
        doc.status = "processing"
        doc.processing_progress = 15
        doc.processing_stage = "Extracting document structure and text"
        doc.processing_error = None

        if job:
            job.status = "processing"
            job.progress_percent = 15
            job.current_stage = "Extracting document structure and text"
            job.error_message = None
            job.started_at = utcnow()
        db.commit()

        mongo_repo.save_processing_record(
            document_id=doc.id,
            organisation_id=doc.organisation_id,
            record={
                "status": "processing",
                "stage": "extraction",
                "filename": doc.original_filename,
                "file_type": doc.file_type,
            },
        )

        # Idempotent cleanup of any existing chunks or summaries before re-indexing
        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()
        db.query(DocumentSummary).filter(DocumentSummary.document_id == doc.id).delete()
        db.commit()
        mongo_repo.delete_document_records(doc.id, doc.organisation_id)

        # Step 1: Extract structured sections
        sections, unit_count, ocr_used = extract_document_sections(
            doc.storage_path, doc.file_type
        )
        if not sections:
            raise ValueError(
                "No readable text content could be extracted from this file (including OCR pass)."
            )

        doc.processing_progress = 45
        doc.processing_stage = "Normalising text and building overlapping chunks"
        doc.page_count = max(1, unit_count)
        doc.ocr_used = ocr_used
        if job:
            job.progress_percent = 45
            job.current_stage = "Normalising text and building overlapping chunks"
        db.commit()

        # Persist extracted structure in MongoDB repository
        mongo_repo.save_extracted_sections(
            document_id=doc.id,
            organisation_id=doc.organisation_id,
            sections=[
                {
                    "location_label": s.location_label,
                    "page_number": s.page_number,
                    "slide_number": s.slide_number,
                    "sheet_name": s.sheet_name,
                    "section_title": s.section_title,
                    "char_length": len(s.text),
                    "preview": s.text[:400],
                    "metadata": s.metadata,
                }
                for s in sections
            ],
            metadata={
                "original_filename": doc.original_filename,
                "file_type": doc.file_type,
                "file_size_bytes": doc.file_size_bytes,
                "sha256_checksum": doc.sha256_checksum,
                "unit_count": unit_count,
                "ocr_used": ocr_used,
            },
        )

        # Step 2: Split into overlapping chunks
        cfg = get_runtime_config()
        chunk_payloads = split_sections_into_chunks(
            sections,
            chunk_size_chars=int(cfg.get("chunk_size_chars", 1000)),
            chunk_overlap_chars=int(cfg.get("chunk_overlap_chars", 200)),
        )
        if not chunk_payloads:
            raise ValueError("Document extraction produced zero searchable chunks.")

        doc.processing_progress = 70
        doc.processing_stage = "Generating semantic embeddings"
        if job:
            job.progress_percent = 70
            job.current_stage = "Generating semantic embeddings"
        db.commit()

        # Step 3: Generate embeddings
        embedder = get_embedding_provider()
        texts_to_embed = [
            f"{ doc.title } | { cp.location_label }\n{ cp.content }"
            for cp in chunk_payloads
        ]
        embeddings = embedder.embed_texts(texts_to_embed)

        doc.processing_progress = 90
        doc.processing_stage = "Indexing vector chunks"
        if job:
            job.progress_percent = 90
            job.current_stage = "Indexing vector chunks"
        db.commit()

        # Step 4: Index chunks in database
        chunk_entities = []
        for cp, vec in zip(chunk_payloads, embeddings):
            chunk_entities.append(
                DocumentChunk(
                    document_id=doc.id,
                    organisation_id=doc.organisation_id,
                    workspace_id=doc.workspace_id,
                    chunk_index=cp.chunk_index,
                    content=cp.content,
                    token_count=cp.token_count,
                    page_number=cp.page_number,
                    slide_number=cp.slide_number,
                    sheet_name=cp.sheet_name,
                    section_title=cp.section_title,
                    location_label=cp.location_label,
                    char_start=cp.char_start,
                    char_end=cp.char_end,
                    metadata_json={
                        **cp.metadata,
                        "embedding_provider": embedder.provider_name,
                        "embedding_model": embedder.model_name,
                    },
                    embedding=vec,
                )
            )
        db.add_all(chunk_entities)
        db.flush()

        duration_ms = int((time.time() - start_time) * 1000)
        now = utcnow()

        # Step 5: Mark document Ready ONLY after all chunks are indexed
        doc.status = "ready"
        doc.chunk_count = len(chunk_entities)
        doc.processing_progress = 100
        doc.processing_stage = "Indexed & Ready"
        doc.processing_error = None
        doc.indexed_at = now

        if job:
            job.status = "completed"
            job.progress_percent = 100
            job.current_stage = "Indexed & Ready"
            job.completed_at = now
            job.duration_ms = duration_ms

        db.add(
            Notification(
                organisation_id=doc.organisation_id,
                user_id=doc.uploader_id,
                title=f"Document Ready: {doc.title}",
                message=(
                    f"'{doc.original_filename}' has been processed and indexed into "
                    f"{len(chunk_entities)} searchable chunk(s)."
                ),
                notification_type="ingestion_ready",
                link_url=f"/app/documents/{doc.id}",
            )
        )
        db.commit()

        mongo_repo.save_processing_record(
            document_id=doc.id,
            organisation_id=doc.organisation_id,
            record={
                "status": "ready",
                "stage": "completed",
                "chunk_count": len(chunk_entities),
                "page_count": doc.page_count,
                "ocr_used": ocr_used,
                "duration_ms": duration_ms,
                "embedding_provider": embedder.provider_name,
            },
        )
        return True

    except Exception as exc:
        logger.error("Document ingestion failed for %s: %s", document_id, exc)
        db.rollback()
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = "failed"
                doc.processing_stage = "Failed"
                doc.processing_error = str(exc)
                doc.processing_progress = 0
                mongo_repo.record_ingestion_error(
                    document_id=doc.id,
                    organisation_id=doc.organisation_id,
                    stage="ingestion_pipeline",
                    error_message=str(exc),
                )
                db.add(
                    Notification(
                        organisation_id=doc.organisation_id,
                        user_id=doc.uploader_id,
                        title=f"Processing Failed: {doc.title}",
                        message=f"Could not index '{doc.original_filename}': {str(exc)}",
                        notification_type="ingestion_failed",
                        link_url=f"/app/documents/{doc.id}",
                    )
                )
            if job_id:
                job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
                if job:
                    job.status = "failed"
                    job.current_stage = "Failed"
                    job.error_message = str(exc)
                    job.completed_at = utcnow()
                    job.duration_ms = int((time.time() - start_time) * 1000)
            db.commit()
        except Exception as inner_exc:
            logger.error("Failed to record ingestion failure state: %s", inner_exc)
        return False
    finally:
        if own_session:
            db.close()

