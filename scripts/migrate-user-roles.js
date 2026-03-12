const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'InfraStack-MeishiGawariniTableV218E81B62-Y3KUDVD81U51';

async function migrate() {
    console.log('Starting migration...');

    try {
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
        const ownerToShops = {};
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
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
