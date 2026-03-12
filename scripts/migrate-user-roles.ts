import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'MeishiGawariniTableV2';

async function migrate() {
    console.log('Starting migration...');

    // 1. Scan for all shops
    const shopsRes = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk AND begins_with(PK, :pk)',
        ExpressionAttributeValues: {
            ':sk': 'METADATA',
            ':pk': 'SHOP#'
        }
    }));

    const shops = shopsRes.Items || [];
    console.log(`Found ${shops.length} shops.`);

    // 2. Group by owner_id
    const ownerToShops: Record<string, string[]> = {};
    for (const shop of shops) {
        const ownerId = shop.owner_id;
        const shopId = shop.PK.replace('SHOP#', '');
        if (!ownerId) continue;
        
        if (!ownerToShops[ownerId]) {
            ownerToShops[ownerId] = [];
        }
        ownerToShops[ownerId].push(shopId);
    }

    // 3. Create GENERAL_MANAGER records
    for (const [ownerId, shopIds] of Object.entries(ownerToShops)) {
        console.log(`Creating GENERAL_MANAGER record for ${ownerId} with ${shopIds.length} shops.`);
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `USER#${ownerId}`,
                SK: 'GENERAL_MANAGER',
                shop_ids: shopIds,
                ts_created_at: new Date().toISOString()
            }
        }));
    }

    console.log('Migration completed successfully.');
}

migrate().catch(console.error);
