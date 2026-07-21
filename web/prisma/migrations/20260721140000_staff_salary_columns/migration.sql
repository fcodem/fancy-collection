-- Add optional staff salary fields (nullable, safe if columns already exist).
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "monthly_salary" DOUBLE PRECISION;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "salary_date" INTEGER;
