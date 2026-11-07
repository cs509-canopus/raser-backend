-- ID's are assigned in a particular way to make testing easier.
--
-- 
--  (1)      (2)  (3)  (4)  (5)
-- '00000000-0000-0000-0000-000000000000'
--
-- (1): user identifier
-- (2): journal | issue | paper
-- (3): rubric
-- (4): 
--

-- Test users
INSERT INTO users (id) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff');
INSERT INTO users (id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO users (id) VALUES ('22222222-2222-2222-2222-222222222222');
INSERT INTO users (id) VALUES ('33333333-3333-3333-3333-333333333333');
INSERT INTO users (id) VALUES ('44444444-4444-4444-4444-444444444444');

-- First 2 users are rubric_designers, second 2 are journal editors
INSERT INTO rubric_designers (id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO rubric_designers (id) VALUES ('22222222-2222-2222-2222-222222222222');
INSERT INTO journal_designers (id) VALUES ('33333333-3333-3333-3333-333333333333');
INSERT INTO journal_designers (id) VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO journal_designers (id) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff');

-- First journal: 
-- id: all 5's
-- owner: user with all 1's
-- name: Test 1
-- description: Test 1 description
-- other fields are null

