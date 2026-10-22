-- RASER database schema — v2, rebuilt from the team's actual ERD
-- Prepared by Kairo for Krishna Garg (WPI CS509, team cs509-canopus/raser-backend).
-- NOT YET APPLIED OR COMMITTED ANYWHERE. Draft for Krishna to review and commit himself.
--
-- SOURCE OF TRUTH FOR THIS VERSION: the team's "Raser ERD" draw.io diagram, Google Drive
-- > CS 509 Canopus > Iteration 1 > "Raser ERD". This supersedes:
--   v1 (cs509-schema-final.sql)      — guessed from the GitHub API issue contracts (#9-#24)
--   v2-discarded (never finalized)   — transcribed from a class-diagram PDF, later found
--                                      to be superseded by this ERD
--
-- *** COULD NOT INDEPENDENTLY RE-OPEN THE LIVE FILE ***
-- This background run has no Google Drive access (no browser, no gdrive/rclone CLI, no
-- stored share link in memory), so I was not able to re-open the draw.io file myself to
-- confirm the parts of RubricQuestion that may have been cropped out of the screenshot,
-- or to re-check every crow's-foot cardinality mark by eye. Everything below is built
-- directly from Krishna's own description of the rendered diagram. Anywhere I had to
-- infer rather than read a value directly, it's marked INFERRED below — check those
-- against the live diagram before treating this as final.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ============================================================================
-- User and its two subtypes (is-a relationship)
-- ============================================================================
-- The ERD draws one User base entity (id, email, password) with two subtypes,
-- RubricDesigner and JournalDesigner, each sharing the base entity's PK. Table-per-subtype
-- is the standard relational mapping for an is-a with attribute-free (or near-empty)
-- subtypes: the subtype tables carry only id, FK'd and PK'd back to users.id.
--
-- INFERRED: the diagram doesn't say whether the two roles are mutually exclusive (a user
-- can't be both) or overlapping (a user can be both a RubricDesigner and a JournalDesigner
-- at once). Nothing in the description rules out overlap, so this schema allows it — a
-- row can exist in both subtype tables for the same user id. If the team intends the roles
-- to be exclusive, add a CHECK via a trigger or a discriminator column; flag to the team.

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password      TEXT NOT NULL,          -- hash, not plaintext — enforce at the app layer
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rubric_designers (
    id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE journal_designers (
    id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Journal / Issue / Paper chain (JournalDesigner --owns--> Journal --has--> Issue
-- --owns--> Paper)
-- ============================================================================
-- Cardinalities as drawn: one JournalDesigner owns many Journals (1:N); one Journal has
-- many Issues (1:N); one Issue owns many Papers (1:N). Each child points back to exactly
-- one parent — standard crow's-foot "one-to-many" reading of each diamond. Re-check the
-- live diagram's crow's-foot marks if any of these turn out to be N:M instead.

CREATE TABLE journals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL REFERENCES journal_designers(id) ON DELETE RESTRICT,
    name          TEXT NOT NULL,
    description   TEXT,
    website_url   TEXT,
    cover_image   TEXT,                   -- S3 key or URL; shape not specified by the ERD
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE issues (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id     UUID NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
    volume_number  INTEGER NOT NULL,
    issue_number   INTEGER NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (journal_id, volume_number, issue_number)
);

-- `authors` — circled/underlined in the ERD. Reading: underline = key-ish/identifying
-- attribute, circle = multivalued attribute (classic Chen notation: a double circle/oval
-- means "multivalued", not "derived" — derived attributes are usually dashed, which is
-- the notation the diagram uses elsewhere for Rubric.totalScore/status). Putting the two
-- marks together on `authors` most plausibly reads as "a multivalued, listable attribute
-- of Paper" — i.e. an ordered/unordered list of author names belonging to the paper, not
-- a standalone entity with its own attributes (no separate Author box, no attributes like
-- affiliation/orcid are shown hanging off it anywhere in the ERD).
--
-- DECISION: modeled as a native TEXT[] array column rather than a separate PaperAuthor
-- join table. Reasoning: a join table is the right call when the multivalued thing is
-- really an entity with its own identity/attributes (needs email, needs to log in, gets
-- referenced elsewhere) — none of that applies here per the ERD. Authors here are just
-- free-text names scoped to one paper. A TEXT[] matches the "multivalued attribute"
-- reading directly without inventing an entity the diagram doesn't draw. (v1 used a join
-- table under a different assumption — API issues implying ordered rows — but with the
-- ERD as the authoritative source, the array column is the more faithful mapping. If the
-- team later needs per-author metadata, a join table is an easy follow-up migration.)
CREATE TABLE papers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id           UUID NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    title              TEXT NOT NULL,
    is_closed          BOOLEAN NOT NULL DEFAULT false,
    authors            TEXT[] NOT NULL DEFAULT '{}',
    publication_date   DATE,
    paper_url          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Rubric (designed by RubricDesigner) + self-referencing replacedBy
-- ============================================================================
--
-- *** FLAG FOR KRISHNA — RAISE WITH THE TEAM, DO NOT SILENTLY TRUST EITHER DOCUMENT ***
-- The ERD places `totalScore` and `status` (both dashed = derived attributes) directly on
-- RUBRIC. The earlier class-diagram transcription (now-discarded v2 attempt) put those
-- same two fields on REVIEW instead. These are genuinely different designs, not a
-- transcription slip on one side:
--   - "Rubric has a derived totalScore/status" reads as: a rubric *template* carries some
--     aggregate/derived number and a status — odd for a template with no scores of its
--     own, unless "status" means something like draft/published/deprecated (which would
--     actually make sense derived from publicationDate/replacedBy) and "totalScore" means
--     something like the max possible score across its questions (sum of each
--     RubricQuestion's max) — also plausible as genuinely rubric-level.
--   - "Review has a derived totalScore/status" reads as: a review's total score (sum of
--     its RubricAnswers' scores) and its status (e.g. completed/pending, derivable from
--     `completed`/`dueDate`) — which also makes complete semantic sense and arguably more
--     intuitively than putting a *score* on a template.
-- Both are internally plausible, which is exactly why this needs a team decision, not a
-- Kairo guess. Per Krishna's instruction, this version follows the ERD (the more
-- authoritative, final document) and puts totalScore/status on `rubrics` below — but this
-- is explicitly NOT a resolved question. Bring this discrepancy to the team before anyone
-- builds against either table's derived columns.
--
-- Cardinality: one RubricDesigner designs many Rubrics (1:N) — designer_id FK below.
-- `replacedBy`: self-referencing, diamond pointing from a deprecated rubric to its
-- replacement. Modeled as a nullable FK to the same table. Reading: many old/deprecated
-- rubrics can each point to the one rubric that replaced them (N:1 from the deprecated
-- side), while a replacement rubric itself has replaced_by_id = NULL (it's current).
-- INFERRED — the ERD diamond doesn't explicitly label which side is "1" vs "N"; this is
-- the only reading that makes semantic sense for a deprecation chain, but double-check the
-- live diagram's crow's-foot marks on that diamond specifically.
CREATE TABLE rubrics (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designer_id              UUID NOT NULL REFERENCES rubric_designers(id) ON DELETE RESTRICT,
    title                    TEXT NOT NULL,
    high_score_threshold     INTEGER NOT NULL,
    low_score_threshold      INTEGER NOT NULL,
    publication_date         TIMESTAMPTZ,       -- NULL until published
    is_favorite              BOOLEAN NOT NULL DEFAULT false,
    replaced_by_id           UUID REFERENCES rubrics(id) ON DELETE SET NULL,
    -- DERIVED per the ERD (dashed attributes) — see the flag above re: Rubric vs Review.
    -- Kept nullable / application- or trigger-maintained rather than a plain stored column,
    -- since "derived" in ER notation means computed from other data, not independently
    -- entered. Exact derivation formula is not specified by the ERD and needs the team's
    -- definition before anyone implements the trigger/view that fills these in.
    total_score              NUMERIC,
    status                   TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (low_score_threshold <= high_score_threshold)
);

-- Rubric — has — RubricQuestion (1:N: one rubric has many questions).
-- `question` and `scoreExplanations` are carried over from the earlier class-diagram
-- transcription for continuity, since the ERD crop Krishna described cuts off before the
-- bottom of this box. INFERRED/UNVERIFIED against the live diagram — flagged explicitly
-- per Krishna's instruction to re-check this box if cropped. If the live diagram shows
-- different or additional fields, this table needs a follow-up correction.
CREATE TABLE rubric_questions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id            UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    section              TEXT,
    index                INTEGER NOT NULL,
    question             TEXT,              -- UNVERIFIED: carried from class diagram, not confirmed on the ERD crop
    score_explanations   TEXT,              -- UNVERIFIED: same as above; may be JSONB if it's per-score-level text
    UNIQUE (rubric_id, index)
);

-- RubricQuestion — has — RubricAnswer (1:N per the ERD as described: one question has
-- many answers).
--
-- INFERRED RELATIONSHIP NOT SHOWN IN THE DESCRIPTION: an answer (`score`, `reasoning`) has
-- to belong to a *specific Review* answering that question — otherwise a RubricAnswer is
-- an orphaned fact with no reviewer and no reviewed paper attached, which doesn't match
-- how the rest of the diagram works (Review is the thing that gets assigned a Rubric and
-- a Paper). The description given doesn't explicitly draw a RubricAnswer-Review diamond,
-- but one almost certainly exists off-screen or was implied by "answers belong to the
-- review that filled the rubric out." Added `review_id` here as the most defensible
-- reading; FLAG THIS to confirm against the live diagram — if there's no such
-- relationship drawn at all, say so and this FK comes out.
CREATE TABLE rubric_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_question_id  UUID NOT NULL REFERENCES rubric_questions(id) ON DELETE CASCADE,
    review_id           UUID NOT NULL,   -- FK added once `reviews` is defined below
    score                NUMERIC,
    reasoning            TEXT,
    UNIQUE (rubric_question_id, review_id)
);

-- ============================================================================
-- Review — assigned a Rubric, assigned a Paper
-- ============================================================================
-- Cardinality: a Review is assigned exactly one Rubric and exactly one Paper (N:1 on both
-- FKs); a Rubric or Paper can have many Reviews assigned to it. Reviewer identity here is
-- by name/email/pin, not a User FK — the ERD doesn't connect Review back to User/
-- RubricDesigner/JournalDesigner at all, so reviewers appear to be external people
-- (not RASER accounts), consistent with the pin-based access pattern (`pin` suggests a
-- reviewer gets a link + PIN rather than logging in as a User).
CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id       UUID NOT NULL REFERENCES rubrics(id) ON DELETE RESTRICT,
    paper_id        UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    reviewer_name   TEXT,
    reviewer_email  TEXT,
    pin             TEXT NOT NULL,
    completed       BOOLEAN NOT NULL DEFAULT false,
    due_date        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rubric_answers
    ADD CONSTRAINT rubric_answers_review_id_fkey
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;

-- ============================================================================
-- Infrastructure note (issue #12)
-- ============================================================================
-- cs509-database-stack-final.ts (the RDS/CDK stack) is infrastructure-only — it
-- provisions the Postgres instance, not any table structure — so none of the above
-- changes it. Left as-is, unaffected by this schema revision.
