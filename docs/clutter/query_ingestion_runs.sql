SELECT
  ir.id,
  ss.name as source_name,
  ss."slug" as source_slug,
  ir."startedAt",
  ir.status,
  ir."rowsRead",
  ir."bytesDownloaded",
  LEFT(ir."errorSummary", 100) as error_summary
FROM "IngestionRun" ir
JOIN "SourceSystem" ss ON ir."sourceSystemId" = ss.id
ORDER BY ir."startedAt" DESC
LIMIT 15;
