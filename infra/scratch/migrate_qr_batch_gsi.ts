
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "MeishiGawariniTableV2";
const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

async function migrate() {
    console.log("Starting migration for QR_BATCH records...");
    let lastEvaluatedKey = undefined;
    let count = 0;
    let updated = 0;

    do {
        const scan: any = await ddb.send(new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: "begins_with(PK, :pk_prefix) AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues: {
                ":pk_prefix": "QR_BATCH#",
                ":sk_prefix": "METADATA"
            },
            ExclusiveStartKey: lastEvaluatedKey
        }));

        for (const item of scan.Items || []) {
            count++;
            if (!item.GSI1_PK) {
                const ts = item.ts_created_at || item.SK.split('#')[1] || new Date().toISOString();
                console.log(`Updating ${item.PK} with GSI1_PK and GSI1_SK=${ts}`);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: item.PK, SK: item.SK },
                    UpdateExpression: "SET GSI1_PK = :gsi1pk, GSI1_SK = :gsi1sk",
                    ExpressionAttributeValues: {
                        ":gsi1pk": "QR_BATCH#METADATA",
                        ":gsi1sk": ts
                    }
                }));
                updated++;
            }
        }
        lastEvaluatedKey = scan.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Migration finished. Scanned: ${count}, Updated: ${updated}`);
}

migrate().catch(console.error);
