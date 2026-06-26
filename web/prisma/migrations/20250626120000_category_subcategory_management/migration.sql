-- CreateTable
CREATE TABLE "hidden_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_sub_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hidden_categories_name_key" ON "hidden_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_sub_categories_name_key" ON "custom_sub_categories"("name");

-- Seed default sub-categories
INSERT INTO "custom_sub_categories" ("name", "active")
VALUES ('Premium', true), ('Normal', true), ('Cheap', true)
ON CONFLICT ("name") DO NOTHING;
