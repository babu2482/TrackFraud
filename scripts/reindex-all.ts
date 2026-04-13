/**
 * Search Reindexing CLI Script
 *
 * Usage:
 *   npx tsx scripts/reindex-all.ts full          - Full reindex of all entities
 *   npx tsx scripts/reindex-all.ts incremental   - Index only new/updated entities
 *   npx tsx scripts/reindex-all.ts status        - Show current index statistics
 *   npx tsx scripts/reindex-all.ts init          - Initialize indexes and populate
 */

import {
  indexAllEntities,
  indexNewEntities,
  initializeAndPopulateIndexes,
  client,
  INDEX_NAMES
} from '../lib/search/indexer';

async function showIndexStatus(): Promise<void> {
  console.log('\n=== Meilisearch Index Status ===\n');

  try {
    // Check Meilisearch health
    const health = await client.getHealth();
    console.log(`Meilisearch Health: ${health.status || 'healthy'}`);

    // Get stats for each index
    for (const [name, indexName] of Object.entries(INDEX_NAMES)) {
      try {
        const index = client.index(indexName);
        const stats = await index.getStats();

        console.log(`\n${indexName} (${name}):`);
        console.log(`  Documents: ${stats.numberOfDocuments}`);
        console.log(`  Is Indexing: ${stats.isIndexing ? 'Yes' : 'No'}`);
        if (stats.fieldDistribution) {
          const fieldCount = Object.keys(stats.fieldDistribution).length;
          console.log(`  Fields: ${fieldCount}`);
        }
      } catch (error) {
        console.log(`\n${indexName} (${name}): ERROR - ${(error as Error).message}`);
      }
    }

    // Check for ongoing tasks
    try {
      const tasks = await client.getTasks({ limit: 5 });
      if (tasks.results.length > 0) {
        console.log('\n\nRecent Tasks:');
        tasks.results.forEach(task => {
          console.log(`  - ${task.status}: ${task.type} (${task.indexUid})`);
        });
      }
    } catch (error) {
      // Ignore task query errors
    }

  } catch (error) {
    console.error('Failed to connect to Meilisearch:', error);
    process.exit(1);
  }
}

async function runFullReindex(): Promise<void> {
  console.log('\n🔄 Starting FULL REINDEX of all entities...\n');

  try {
    const stats = await indexAllEntities(100, INDEX_NAMES.ALL_ENTITIES);

    console.log('\n✅ Full reindex complete!');
    console.log(`\nSummary:`);
    console.log(`  Total Processed: ${stats.totalProcessed}`);
    console.log(`  Successfully Indexed: ${stats.successfullyIndexed}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Error Rate: ${(stats.failed / stats.totalProcessed * 100).toFixed(2)}%`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️ First 5 errors:`);
      stats.errors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.entityId}: ${err.error}`);
      });
    }

    process.exit(stats.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Reindex failed:', error);
    process.exit(1);
  }
}

async function runIncrementalIndex(): Promise<void> {
  const sinceDateStr = process.argv[3] || '24h';

  let sinceDate: Date;

  if (sinceDateStr === 'last-run') {
    // Default to last 24 hours if no specific date provided
    sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(sinceDateStr)) {
    // ISO date format
    sinceDate = new Date(sinceDateStr);
  } else if (/^\d+h$/.test(sinceDateStr)) {
    // Relative time (e.g., "6h", "12h")
    const hours = parseInt(sinceDateStr.replace('h', ''));
    sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  } else {
    console.error(`Invalid date format: ${sinceDateStr}`);
    console.error('Use ISO format (2024-01-15) or relative time (6h, 12h, 24h)');
    process.exit(1);
  }

  console.log(`\n🔄 Starting INCREMENTAL INDEX for entities updated since ${sinceDate.toISOString()}...\n`);

  try {
    const stats = await indexNewEntities(sinceDate, 100, INDEX_NAMES.ALL_ENTITIES);

    console.log('\n✅ Incremental index complete!');
    console.log(`\nSummary:`);
    console.log(`  Total Processed: ${stats.totalProcessed}`);
    console.log(`  Successfully Indexed: ${stats.successfullyIndexed}`);
    console.log(`  Failed: ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️ Errors:`);
      stats.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.entityId}: ${err.error}`);
      });
    }

    process.exit(stats.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Incremental index failed:', error);
    process.exit(1);
  }
}

async function initializeIndexes(): Promise<void> {
  console.log('\n🔧 Initializing and populating all search indexes...\n');

  try {
    await initializeAndPopulateIndexes();

    console.log('\n✅ Index initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         TrackFraud Search Reindexing Tool                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  switch (command) {
    case 'status':
      await showIndexStatus();
      break;

    case 'full':
      await runFullReindex();
      break;

    case 'incremental':
      await runIncrementalIndex();
      break;

    case 'init':
      await initializeIndexes();
      break;

    case '--help':
    case '-h':
    case 'help':
      console.log('\nUsage: npx tsx scripts/reindex-all.ts <command> [options]\n');
      console.log('Commands:');
      console.log('  status        Show current index statistics and health');
      console.log('  full          Perform complete reindex of all entities');
      console.log('  incremental   Index only new/updated entities');
      console.log('                Optional: specify date (e.g., "2024-01-15" or "6h")');
      console.log('  init          Initialize indexes with settings and populate\n');
      console.log('Examples:');
      console.log('  npx tsx scripts/reindex-all.ts status');
      console.log('  npx tsx scripts/reindex-all.ts full');
      console.log('  npx tsx scripts/reindex-all.ts incremental 24h');
      console.log('  npx tsx scripts/reindex-all.ts incremental 2024-01-15T00:00:00Z');
      console.log('  npx tsx scripts/reindex-all.ts init\n');
      process.exit(0);

    default:
      console.error('\n❌ Unknown command:', command);
      console.error('\nRun with --help for usage information.');
      process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
