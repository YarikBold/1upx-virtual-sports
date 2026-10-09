ALTER TABLE "Fixture" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Season_one_active_per_user" ON "Season" ("userId") WHERE "simulationState" IN ('READY', 'RUNNING', 'PAUSED', 'FINISHING');
