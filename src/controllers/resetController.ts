import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = "Packages";

/**
 * Reset the registry by clearing the DynamoDB table.
 */
export const resetRegistry = async (authToken: string): Promise<{ statusCode: number, body: string }> => {
  try {
    if (!authToken) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' }),
      };
    }

    if (authToken !== "admin") {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'You do not have permission to reset the registry.' }),
      };
    }

    // Scan and delete all items in the table (DynamoDB doesn't directly support truncate)
    const scanParams = { TableName: TABLE_NAME };
    const scanResult = await dynamoDBDocClient.send(new ScanCommand(scanParams));

    if (scanResult.Items) {
      const deletePromises = scanResult.Items.map(item =>
        dynamoDBDocClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PackageID: item.PackageID } }))
      );
      await Promise.all(deletePromises);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Registry has been reset.' }),
    };
  } catch (error) {
    console.error("Error resetting registry:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' }),
    };
  }
};
