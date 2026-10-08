-- Cover foreign keys used by fixture and rating lookups.
CREATE INDEX IF NOT EXISTS "Fixture_competitionId_idx" ON public."Fixture"("competitionId");
CREATE INDEX IF NOT EXISTS "Rating_participantId_idx" ON public."Rating"("participantId");
