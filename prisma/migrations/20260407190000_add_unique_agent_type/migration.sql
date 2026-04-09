-- Remove duplicate agent types before enforcing uniqueness.
DELETE FROM "Agent"
WHERE "id" NOT IN (
    SELECT "keep_id"
    FROM (
        SELECT MIN("id") AS "keep_id"
        FROM "Agent"
        GROUP BY "type"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_type_key" ON "Agent"("type");
