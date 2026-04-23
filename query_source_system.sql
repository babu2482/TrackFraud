SELECT
  ss.name,
  ss."slug" as source_slug,
  ss."lastSuccessfulSyncAt",
  ss."lastAttemptedSyncAt",
  LEFT("ss"."lastError", 100) as last_error,
  EXTRACT(EPOCH FROM (NOW() - COALESCE("ss"."lastSuccessfulSyncAt", "ss"."lastAttemptedSyncAt"))) / 3600 AS hours_since_sync
FROM "SourceSystem" ss
ORDER BY COALESCE("ss"."lastSuccessfulSyncAt", "ss"."lastAttemptedSyncAt") ASC NULLS LAST
LIMIT 40;
