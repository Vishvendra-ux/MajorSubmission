# SUMIND-IQ — Database Schema & Polyglot Persistence

## 1. Authoritative Data Boundaries

- **PostgreSQL (`pgvector`)**: Single authoritative source of truth for identity (`users`, `refresh_sessions`, `password_reset_records`), multi-tenant isolation (`organisations`, `organisation_memberships`, `workspaces`, `workspace_memberships`), RBAC (`roles`, `permissions`, `role_permissions`), document ownership & access policies (`documents`, `document_access_policies`), searchable vector chunks (`document_chunks`), hierarchical summaries (`document_summaries`), RAG conversations (`conversations`, `messages`, `feedbacks`), and tamper-evident audit logs (`audit_logs`).
- **MongoDB**: Stores non-authoritative document-oriented structural extraction metadata (`document_structures`) and verbose ingestion pipeline stage telemetry (`processing_records`). Security-sensitive permissions are never duplicated or trusted from MongoDB.

## 2. Entity-Relationship Diagram (PostgreSQL)

```mermaid
erDiagram
    ORGANISATION ||--o{ ORGANISATION_MEMBERSHIP : has
    ORGANISATION ||--o{ WORKSPACE : owns
    ORGANISATION ||--o{ DOCUMENT : scopes
    ORGANISATION ||--o{ CONVERSATION : scopes
    ORGANISATION ||--o{ AUDIT_LOG : records

    USER ||--o{ ORGANISATION_MEMBERSHIP : belongs_to
    USER ||--o{ WORKSPACE_MEMBERSHIP : member_of
    USER ||--o{ DOCUMENT : uploads
    USER ||--o{ CONVERSATION : starts
    USER ||--o{ FEEDBACK : submits
    USER ||--o{ REFRESH_SESSION : holds

    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : assigned_to
    ROLE ||--o{ ORGANISATION_MEMBERSHIP : defines

    WORKSPACE ||--o{ WORKSPACE_MEMBERSHIP : contains
    WORKSPACE ||--o{ DOCUMENT : scopes

    DOCUMENT ||--o{ DOCUMENT_ACCESS_POLICY : governed_by
    DOCUMENT ||--o{ DOCUMENT_CHUNK : indexed_into
    DOCUMENT ||--o| DOCUMENT_SUMMARY : summarized_by
    DOCUMENT ||--o{ PROCESSING_JOB : processed_by

    CONVERSATION ||--o{ MESSAGE : contains
    MESSAGE ||--o{ FEEDBACK : rated_by

    ORGANISATION {
        string id PK
        string name
        string slug UK
        boolean is_active
        boolean is_demo
    }

    USER {
        string id PK
        string email UK
        string full_name
        string password_hash
        boolean is_active
    }

    DOCUMENT {
        string id PK
        string organisation_id FK
        string workspace_id FK
        string uploader_id FK
        string title
        string file_type
        string sha256_checksum
        string status
        string visibility
        json allowed_roles_json
    }

    DOCUMENT_CHUNK {
        string id PK
        string document_id FK
        string organisation_id FK
        int chunk_index
        string location_label
        text content
        vector embedding
    }

    DOCUMENT_ACCESS_POLICY {
        string id PK
        string document_id FK
        string principal_type
        string principal_id
        string access_level
        string effect
    }
```

## 3. Migrations & Seeding

- Database migrations are managed via **Alembic** in `backend/migrations/versions/0001_initial_schema.py`.
- Run migrations:
  ```bash
  cd backend
  alembic upgrade head
  ```
- Seed initial roles, permissions, and `[DEMO]` evaluation data:
  ```bash
  cd backend
  python -m app.db.seed
  ```

