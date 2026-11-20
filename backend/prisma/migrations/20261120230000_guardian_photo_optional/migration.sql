-- Guardians no longer need a photo.
ALTER TABLE "Guardian" ALTER COLUMN "photoUrl" DROP NOT NULL;
