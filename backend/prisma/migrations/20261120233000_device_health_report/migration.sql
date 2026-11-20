-- Phone-reported health (agent version, battery restrictions) to diagnose silent phones.
ALTER TABLE "Device"
  ADD COLUMN "agentVersion" TEXT,
  ADD COLUMN "ignoresBatteryOpt" BOOLEAN,
  ADD COLUMN "backgroundRestricted" BOOLEAN,
  ADD COLUMN "standbyBucket" TEXT;
