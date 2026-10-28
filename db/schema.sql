-- RASER database schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users are managed by Cognito, we just store the id
CREATE TABLE users (
    id            UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pk PRIMARY KEY (id)
);

CREATE TABLE rubric_designers (
    id   UUID,
    CONSTRAINT rubric_designers_pk PRIMARY KEY (id),
    CONSTRAINT rubric_designers_id_fk FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE journal_designers (
    id   UUID,
    CONSTRAINT journal_designers_pk PRIMARY KEY (id),
    CONSTRAINT journal_designers_id_fk FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE journals (
    id            UUID DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    website_url   TEXT,
    cover_image   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT journals_pk PRIMARY KEY (id),
    CONSTRAINT journals_owner_fk FOREIGN KEY (owner_id) REFERENCES journal_designers (id) ON DELETE RESTRICT
);

CREATE TABLE issues (
    id             UUID DEFAULT gen_random_uuid(),
    journal_id     UUID NOT NULL,
    volume_number  INTEGER NOT NULL,
    issue_number   INTEGER NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT issues_pk PRIMARY KEY (id),
    CONSTRAINT issues_journal_fk FOREIGN KEY (journal_id) REFERENCES journals (id) ON DELETE CASCADE,
    CONSTRAINT issues_journal_volume_number_uq UNIQUE (journal_id, volume_number, issue_number)
);

-- authors is a list of free-text names, not its own entity
CREATE TABLE papers (
    id                 UUID DEFAULT gen_random_uuid(),
    issue_id           UUID NOT NULL,
    title              TEXT NOT NULL,
    is_closed          BOOLEAN NOT NULL DEFAULT false,
    authors            TEXT[] NOT NULL DEFAULT '{}',
    publication_date   DATE,
    paper_url          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT papers_pk PRIMARY KEY (id),
    CONSTRAINT papers_issue_fk FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE RESTRICT
);

-- replaced_by_id points a deprecated rubric at the one that replaced it
CREATE TABLE rubrics (
    id                       UUID DEFAULT gen_random_uuid(),
    designer_id              UUID NOT NULL,
    title                    TEXT NOT NULL,
    high_score_threshold     INTEGER NOT NULL,
    low_score_threshold      INTEGER NOT NULL,
    publication_date         TIMESTAMPTZ,
    is_favorite              BOOLEAN NOT NULL DEFAULT false,
    replaced_by_id           UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rubrics_pk PRIMARY KEY (id),
    CONSTRAINT rubrics_designer_fk FOREIGN KEY (designer_id) REFERENCES rubric_designers (id) ON DELETE RESTRICT,
    CONSTRAINT rubrics_replaced_by_fk FOREIGN KEY (replaced_by_id) REFERENCES rubrics (id) ON DELETE SET NULL,
    CONSTRAINT rubrics_threshold_check CHECK (low_score_threshold <= high_score_threshold)
);

-- weak entity, keyed off its rubric + section + index
CREATE TABLE rubric_questions (
    rubric_id            UUID NOT NULL,
    section              INTEGER NOT NULL,
    index                INTEGER NOT NULL,
    question             TEXT,
    score_explanations   TEXT,
    CONSTRAINT rubric_questions_pk PRIMARY KEY (rubric_id, section, index),
    CONSTRAINT rubric_questions_rubric_fk FOREIGN KEY (rubric_id) REFERENCES rubrics (id) ON DELETE CASCADE
);

CREATE TABLE reviews (
    id              UUID DEFAULT gen_random_uuid(),
    rubric_id       UUID NOT NULL,
    paper_id        UUID NOT NULL,
    reviewer_name   TEXT,
    reviewer_email  TEXT,
    pin             TEXT NOT NULL,
    completed       BOOLEAN NOT NULL DEFAULT false,
    due_date        TIMESTAMPTZ,
    total_score     NUMERIC,
    status          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reviews_pk PRIMARY KEY (id),
    CONSTRAINT reviews_rubric_fk FOREIGN KEY (rubric_id) REFERENCES rubrics (id) ON DELETE RESTRICT,
    CONSTRAINT reviews_paper_fk FOREIGN KEY (paper_id) REFERENCES papers (id) ON DELETE CASCADE
);

-- weak entity, keyed off its question + review
CREATE TABLE rubric_answers (
    rubric_question_rubric_id   UUID NOT NULL,
    rubric_question_section     INTEGER NOT NULL,
    rubric_question_index       INTEGER NOT NULL,
    review_id                   UUID NOT NULL,
    score                       NUMERIC,
    reasoning                   TEXT,
    CONSTRAINT rubric_answers_pk PRIMARY KEY (rubric_question_rubric_id, rubric_question_section, rubric_question_index, review_id),
    CONSTRAINT rubric_answers_question_fk FOREIGN KEY (rubric_question_rubric_id, rubric_question_section, rubric_question_index)
        REFERENCES rubric_questions (rubric_id, section, index) ON DELETE CASCADE,
    CONSTRAINT rubric_answers_review_fk FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE
);
