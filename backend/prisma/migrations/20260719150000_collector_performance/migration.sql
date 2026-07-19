-- Phase 4: Collector work sessions + daily performance rollups

CREATE TABLE "CollectorWorkSession" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL_CLOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollectorWorkSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectorDailyStat" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "callsCount" INTEGER NOT NULL DEFAULT 0,
    "talkSeconds" INTEGER NOT NULL DEFAULT 0,
    "smsCount" INTEGER NOT NULL DEFAULT 0,
    "whatsappCount" INTEGER NOT NULL DEFAULT 0,
    "followUpsCount" INTEGER NOT NULL DEFAULT 0,
    "casesWorked" INTEGER NOT NULL DEFAULT 0,
    "ptpCount" INTEGER NOT NULL DEFAULT 0,
    "hoursWorkedSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollectorDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectorWorkSession_collectorId_startedAt_idx" ON "CollectorWorkSession"("collectorId", "startedAt");
CREATE INDEX "CollectorWorkSession_collectorId_endedAt_idx" ON "CollectorWorkSession"("collectorId", "endedAt");

CREATE UNIQUE INDEX "CollectorDailyStat_collectorId_date_key" ON "CollectorDailyStat"("collectorId", "date");
CREATE INDEX "CollectorDailyStat_date_idx" ON "CollectorDailyStat"("date");

ALTER TABLE "CollectorWorkSession" ADD CONSTRAINT "CollectorWorkSession_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectorDailyStat" ADD CONSTRAINT "CollectorDailyStat_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
