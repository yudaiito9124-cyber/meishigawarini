import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "InfraStack-stg-MeishiGawariniTableV2stg5DC5099D-LI8MBONMHDR1";
const AWS_REGION = process.env.AWS_REGION || "ap-northeast-1";
const client = new DynamoDBClient({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client);

async function migrate() {
    console.log("Starting migration...");
    
    let lastKey = undefined;
    let count = 0;
    let migrated = 0;

    do {
        const scanRes: any = await ddb.send(new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: "SK = :sk",
            ExpressionAttributeValues: { ":sk": "METADATA" },
            ExclusiveStartKey: lastKey
        }));

        for (const item of scanRes.Items) {
            count++;
            const shopId = item.PK.replace("SHOP#", "");
            
            const hasDetail = item.detail_html !== undefined || item.html_image_urls !== undefined;
            const hasShipping = item.shipping_label_settings !== undefined;

            if (hasDetail || hasShipping) {
                console.log(`Migrating shop: ${shopId}`);
                
                const transactItems: any[] = [];
                const removes: string[] = [];
                
                if (hasDetail) {
                    transactItems.push({
                        Update: {
                            TableName: TABLE_NAME,
                            Key: { PK: `SHOP#${shopId}`, SK: "DETAIL_HTML" },
                            UpdateExpression: "SET detail_html = :html, html_image_urls = :hiu, ts_updated_at = :now",
                            ExpressionAttributeValues: {
                                ":html": item.detail_html || "",
                                ":hiu": item.html_image_urls || [],
                                ":now": new Date().toISOString()
                            }
                        }
                    });
                    removes.push("detail_html", "html_image_urls");
                }

                if (hasShipping) {
                    transactItems.push({
                        Update: {
                            TableName: TABLE_NAME,
                            Key: { PK: `SHOP#${shopId}`, SK: "SETTINGS#SHIPPING_LABEL" },
                            UpdateExpression: "SET shipping_label_settings = :sls, ts_updated_at = :now",
                            ExpressionAttributeValues: {
                                ":sls": item.shipping_label_settings,
                                ":now": new Date().toISOString()
                            }
                        }
                    });
                    removes.push("shipping_label_settings");
                }

                if (removes.length > 0) {
                    transactItems.push({
                        Update: {
                            TableName: TABLE_NAME,
                            Key: { PK: item.PK, SK: item.SK },
                            UpdateExpression: `REMOVE ${removes.join(", ")}`
                        }
                    });
                }

                try {
                    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
                    migrated++;
                } catch (err) {
                    console.error(`Failed to migrate ${shopId}:`, err);
                }
            }
        }

        lastKey = scanRes.LastEvaluatedKey;
    } while (lastKey);

    console.log(`Migration finished. Total shops scanned: ${count}, Migrated: ${migrated}`);
}

migrate().catch(console.error);
