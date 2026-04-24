import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "MeishigawariniStack-Database7F04E63C-1G4XJ4E0Z6X9N"; // Defaulting to one I saw before, but I should check env or stack

async function check() {
    const res = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(detail_html)",
        ExpressionAttributeValues: {
            ":prefix": "SHOP#",
            ":sk": "METADATA"
        }
    }));

    console.log("Shops with legacy detail_html in METADATA:", res.Items?.length || 0);
    if (res.Items && res.Items.length > 0) {
        res.Items.forEach(i => console.log(`- ${i.PK}: ${i.name}`));
    }

    const res2 = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(shipping_label_settings)",
        ExpressionAttributeValues: {
            ":prefix": "SHOP#",
            ":sk": "METADATA"
        }
    }));

    console.log("Shops with legacy shipping_label_settings in METADATA:", res2.Items?.length || 0);
}

check();
