-- AI-generated mock database test data. Every test case starts with exactly this.
--
-- UUID scheme: TTTTTTTT-0000-4000-8000-PPPPPPPPPPPP
--   T = row type, one digit repeated: 1 user, 2 journal, 3 issue, 4 paper, 5 rubric, 6 review
--   P = position, two digits per level from parent to child
--       e.g. 44444444-0000-4000-8000-000000020101 = journal 2, issue 1, paper 1
--   Users end in e1/e2 (journal editors) or d1/d2 (rubric designers).
--   "-4000-8000-" makes every ID a valid version-4 UUID, so strict validators accept them.
-- Everything numbered N belongs together: editor eN owns journal N, designer dN owns rubric N,
-- and review N scores paper 1 of journal N's issue 1 using rubric N.
--
-- created_at values are explicit so that ORDER BY created_at is deterministic. With the
-- DEFAULT now(), every row in this file would get the same timestamp.

-- USERS 

INSERT INTO users (id, created_at) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-01-01T09:00:00Z'), -- for backwards compatibilty
  ('11111111-0000-4000-8000-0000000000e1', '2026-01-01T09:00:00Z'), -- journal editor 1
  ('11111111-0000-4000-8000-0000000000e2', '2026-01-01T10:00:00Z'), -- journal editor 2
  ('11111111-0000-4000-8000-0000000000d1', '2026-01-01T11:00:00Z'), -- rubric designer 1
  ('11111111-0000-4000-8000-0000000000d2', '2026-01-01T12:00:00Z'); -- rubric designer 2

INSERT INTO journal_designers (id) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff'), -- for backwards compatibilty
  ('11111111-0000-4000-8000-0000000000e1'),
  ('11111111-0000-4000-8000-0000000000e2');

INSERT INTO rubric_designers (id) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff'), -- for backwards compatibilty
  ('11111111-0000-4000-8000-0000000000d1'),
  ('11111111-0000-4000-8000-0000000000d2');

-- JOURNALS 
-- Journal 1 has every optional field set; journal 2 leaves website_url and cover_image NULL.

INSERT INTO journals (id, owner_id, name, description, website_url, cover_image, created_at) VALUES
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000e1',
   'Journal of Plant Cell Culture',
   'Peer-reviewed research on in vitro plant systems.',
   'https://plant-journal.example.com',
   'https://plant-journal.example.com/cover.png',
   '2026-01-02T09:00:00Z'),
  ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-0000000000e2',
   'Mammalian Cell Methods',
   'Methods and results from in vitro mammalian cell studies.',
   NULL,
   NULL,
   '2026-01-02T10:00:00Z');

-- ISSUES 
-- Two per journal. Issue 1 holds the papers; issue 2 is empty.

INSERT INTO issues (id, journal_id, volume_number, issue_number, created_at) VALUES
  ('33333333-0000-4000-8000-000000000101', '22222222-0000-4000-8000-000000000001', 1, 1, '2026-01-03T09:00:00Z'),
  ('33333333-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001', 1, 2, '2026-01-03T10:00:00Z'),
  ('33333333-0000-4000-8000-000000000201', '22222222-0000-4000-8000-000000000002', 1, 1, '2026-01-03T11:00:00Z'),
  ('33333333-0000-4000-8000-000000000202', '22222222-0000-4000-8000-000000000002', 1, 2, '2026-01-03T12:00:00Z');

-- PAPERS 
-- Two in issue 1 of each journal. Paper 1 of each issue has a review; paper 2 has none.
-- The optional fields vary (NULL dates and URLs, one empty authors array) to cover edge cases.

INSERT INTO papers (id, issue_id, title, authors, publication_date, paper_url, created_at) VALUES
  ('44444444-0000-4000-8000-000000010101', '33333333-0000-4000-8000-000000000101',
   'Somatic Embryogenesis in Coffea arabica Leaf Explants',
   ARRAY['Ana Torres', 'Ben Okafor'], '2026-03-15', 'https://papers.example.com/coffea.pdf',
   '2026-01-04T09:00:00Z'),
  ('44444444-0000-4000-8000-000000010102', '33333333-0000-4000-8000-000000000101',
   'Light Quality Effects on Shoot Proliferation of Blueberry',
   ARRAY['Chen Wei'], NULL, NULL,
   '2026-01-04T10:00:00Z'),
  ('44444444-0000-4000-8000-000000020101', '33333333-0000-4000-8000-000000000201',
   'Hypoxia Response in Primary Human Fibroblasts',
   ARRAY['Dana Fischer', 'Eli Moreau', 'Farah Haddad'], '2026-04-01', 'https://papers.example.com/hypoxia.pdf',
   '2026-01-04T11:00:00Z'),
  ('44444444-0000-4000-8000-000000020102', '33333333-0000-4000-8000-000000000201',
   'Serum-Free Expansion of CHO Cells',
   '{}', NULL, 'https://papers.example.com/cho.pdf',
   '2026-01-04T12:00:00Z');

-- RUBRICS 
-- Both published. 10 questions each, so the maximum score is 50.

INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold, publication_date, created_at) VALUES
  ('55555555-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000d1',
   'In Vitro Plant Culture Rubric', 40, 25, '2026-01-10T09:00:00Z', '2026-01-05T09:00:00Z'),
  ('55555555-0000-4000-8000-000000000002', '11111111-0000-4000-8000-0000000000d2',
   'In Vitro Mammalian Cell Rubric', 42, 28, '2026-01-10T10:00:00Z', '2026-01-05T10:00:00Z');

-- RUBRIC QUESTIONS 
-- Sections: 1 Introduction, 2 Materials & Sourcing, 3 Methodology & Reproducibility,
--           4 Replication, Bias & Statistics, 5 Reporting & Transparency

INSERT INTO rubric_questions (rubric_id, section, index, question, score_explanations) VALUES
  -- Rubric 1: In Vitro Plant Culture
  ('55555555-0000-4000-8000-000000000001', 1, 1,
   'Is key relevant literature cited?',
   '5 = all key prior work cited; 4 = relevant but excessive citations; 3 = some citations not relevant; 2 = few citations; 1 = no citations'),
  ('55555555-0000-4000-8000-000000000001', 1, 2,
   'Is there a clearly stated hypothesis?',
   '5 = clear hypothesis; 4 = hypothesis present but unclear; 3 = aims but no hypothesis; 2 = poorly worded aims; 1 = no aims'),
  ('55555555-0000-4000-8000-000000000001', 2, 1,
   'Are all chemical and biological materials identified with their source?',
   '5 = every material has manufacturer and product number; 4 = one minor gap; 3 = most identified; 2 = many missing; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000001', 2, 2,
   'Is the source of the plant material and explant documented?',
   '5 = species, cultivar and explant fully described; 4 = one minor gap; 3 = partially described; 2 = mostly missing; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000001', 3, 1,
   'Are culture conditions (medium, light, temperature) fully specified?',
   '5 = all conditions specified; 4 = one minor omission; 3 = several omissions; 2 = mostly unspecified; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000001', 3, 2,
   'Could another lab reproduce the protocol from the description?',
   '5 = fully reproducible; 4 = minor clarification needed; 3 = key steps unclear; 2 = major steps missing; 1 = not reproducible'),
  ('55555555-0000-4000-8000-000000000001', 4, 1,
   'Are biological replicates sufficient and reported?',
   '5 = adequate replicates clearly reported; 4 = adequate but unclear; 3 = borderline; 2 = insufficient; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000001', 4, 2,
   'Are the statistical tests appropriate and described?',
   '5 = appropriate and fully described; 4 = appropriate, minor gaps; 3 = questionable choice; 2 = inappropriate; 1 = no statistics'),
  ('55555555-0000-4000-8000-000000000001', 5, 1,
   'Do the conclusions follow from the data?',
   '5 = fully supported; 4 = mostly supported; 3 = partly overstated; 2 = largely unsupported; 1 = contradicted by the data'),
  ('55555555-0000-4000-8000-000000000001', 5, 2,
   'Are raw data or supplementary materials available?',
   '5 = all data available; 4 = most available; 3 = summary data only; 2 = on request only; 1 = not available'),

  -- Rubric 2: In Vitro Mammalian Cell
  ('55555555-0000-4000-8000-000000000002', 1, 1,
   'Is the research gap clearly established?',
   '5 = gap clearly established; 4 = established but vague; 3 = implied only; 2 = unclear; 1 = absent'),
  ('55555555-0000-4000-8000-000000000002', 1, 2,
   'Are the study objectives stated?',
   '5 = specific and stated; 4 = stated but broad; 3 = implied; 2 = confusing; 1 = absent'),
  ('55555555-0000-4000-8000-000000000002', 2, 1,
   'Are cell lines identified with repository and catalog number?',
   '5 = all fully identified; 4 = one minor gap; 3 = most identified; 2 = many missing; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000002', 2, 2,
   'Is cell line authentication and mycoplasma testing reported?',
   '5 = both reported with methods; 4 = both reported, no methods; 3 = one reported; 2 = mentioned vaguely; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000002', 3, 1,
   'Are passage numbers and culture conditions reported?',
   '5 = fully reported; 4 = one minor gap; 3 = partially reported; 2 = mostly missing; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000002', 3, 2,
   'Are appropriate positive and negative controls included?',
   '5 = all needed controls; 4 = one minor control missing; 3 = key control missing; 2 = controls inadequate; 1 = no controls'),
  ('55555555-0000-4000-8000-000000000002', 4, 1,
   'Were experiments repeated independently at least three times?',
   '5 = 3 or more independent repeats; 4 = 3 repeats, unclear if independent; 3 = 2 repeats; 2 = technical replicates only; 1 = not reported'),
  ('55555555-0000-4000-8000-000000000002', 4, 2,
   'Are blinding and randomization addressed?',
   '5 = both applied and described; 4 = one applied; 3 = discussed but not applied; 2 = mentioned vaguely; 1 = not addressed'),
  ('55555555-0000-4000-8000-000000000002', 5, 1,
   'Are figures consistent with the reported results?',
   '5 = fully consistent; 4 = minor inconsistency; 3 = several inconsistencies; 2 = major inconsistencies; 1 = contradictory'),
  ('55555555-0000-4000-8000-000000000002', 5, 2,
   'Are the limitations of the study discussed?',
   '5 = thoroughly discussed; 4 = discussed briefly; 3 = partially; 2 = superficially; 1 = not discussed');

-- REVIEWS 
-- Review 1: completed, all 10 questions answered, total 42 (at or above rubric 1's high threshold of 40).
-- Review 2: in progress, 5 of 10 answered, no total yet. Its due date is far in the future so
--           that tests checking for overdue reviews don't start failing as time passes.

INSERT INTO reviews (id, rubric_id, paper_id, reviewer_name, reviewer_email, pin, completed, due_date, total_score, created_at) VALUES
  ('66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000010101',
   'Riley Reviewer', 'riley@example.com', '482913', true, '2026-02-01T23:59:59Z', 42, '2026-01-06T09:00:00Z'),
  ('66666666-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000020101',
   'Sam Reviewer', 'sam@example.com', '730561', false, '2030-01-01T23:59:59Z', NULL, '2026-01-06T10:00:00Z');

-- RUBRIC ANSWERS 

INSERT INTO rubric_answers (rubric_question_rubric_id, rubric_question_section, rubric_question_index, review_id, score, reasoning) VALUES
  -- Review 1 (rubric 1): every question answered. 5+4 + 4+3 + 5+5 + 3+4 + 4+5 = 42
  ('55555555-0000-4000-8000-000000000001', 1, 1, '66666666-0000-4000-8000-000000000001', 5, 'All key prior studies on coffee embryogenesis are cited.'),
  ('55555555-0000-4000-8000-000000000001', 1, 2, '66666666-0000-4000-8000-000000000001', 4, 'Hypothesis is present but buried in the last paragraph.'),
  ('55555555-0000-4000-8000-000000000001', 2, 1, '66666666-0000-4000-8000-000000000001', 4, 'One growth regulator is missing a product number.'),
  ('55555555-0000-4000-8000-000000000001', 2, 2, '66666666-0000-4000-8000-000000000001', 3, 'Cultivar is named but the explant age is not given.'),
  ('55555555-0000-4000-8000-000000000001', 3, 1, '66666666-0000-4000-8000-000000000001', 5, 'Medium, photoperiod and temperature are fully specified.'),
  ('55555555-0000-4000-8000-000000000001', 3, 2, '66666666-0000-4000-8000-000000000001', 5, 'Protocol is detailed enough to repeat exactly.'),
  ('55555555-0000-4000-8000-000000000001', 4, 1, '66666666-0000-4000-8000-000000000001', 3, 'Only two biological replicates per treatment.'),
  ('55555555-0000-4000-8000-000000000001', 4, 2, '66666666-0000-4000-8000-000000000001', 4, 'ANOVA is appropriate; the post-hoc test is not named.'),
  ('55555555-0000-4000-8000-000000000001', 5, 1, '66666666-0000-4000-8000-000000000001', 4, 'Conclusions slightly overstate the yield improvement.'),
  ('55555555-0000-4000-8000-000000000001', 5, 2, '66666666-0000-4000-8000-000000000001', 5, 'Raw counts are provided as supplementary data.'),

  -- Review 2 (rubric 2): sections 1 and 2 answered, plus the first question of section 3. 3+2 + 4+4 + 2 = 15 so far
  ('55555555-0000-4000-8000-000000000002', 1, 1, '66666666-0000-4000-8000-000000000002', 3, 'The research gap is implied rather than stated.'),
  ('55555555-0000-4000-8000-000000000002', 1, 2, '66666666-0000-4000-8000-000000000002', 2, 'Objectives are spread across several paragraphs.'),
  ('55555555-0000-4000-8000-000000000002', 2, 1, '66666666-0000-4000-8000-000000000002', 4, 'Repository is given; one catalog number is missing.'),
  ('55555555-0000-4000-8000-000000000002', 2, 2, '66666666-0000-4000-8000-000000000002', 4, 'Both tests are reported without describing the methods.'),
  ('55555555-0000-4000-8000-000000000002', 3, 1, '66666666-0000-4000-8000-000000000002', 2, 'Passage numbers are not reported.');

