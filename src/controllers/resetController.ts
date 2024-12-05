import { S3Client, DeleteObjectsCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';





//initialize S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

//initialize dynamoDB client
const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION,
})

//Function to delete all items in a DynamoDB table
export const resetDynamoDBTable = async (tableName: string, keyName: string = 'id') => {
  try {
    const batchSize = 25;
    const scanCommand = new ScanCommand({
      TableName: tableName,
    });

    let items = await dynamoDb.send(scanCommand);

    while (items.Items && items.Items.length > 0) {
      // Process items in batches
      for (let i = 0; i < items.Items.length; i += batchSize) {
        const batch = items.Items.slice(i, i + batchSize);
        const batchWriteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: marshall({
              [keyName]: item[keyName]
            })
          }
        }));

        // Add retry logic for unprocessed items
        let unprocessedItems = {
          [tableName]: batchWriteRequests
        };
        
        let retryCount = 0;
        const maxRetries = 3;
        
        while (Object.keys(unprocessedItems).length > 0 && retryCount < maxRetries) {
          const batchWriteResult = await dynamoDb.send(new BatchWriteItemCommand({
            RequestItems: unprocessedItems
          }));
          
          // If there are unprocessed items, retry them
          unprocessedItems = (batchWriteResult.UnprocessedItems || {}) as {
            [key: string]: { DeleteRequest: { Key: Record<string, any> } }[];
          };
          
          if (Object.keys(unprocessedItems).length > 0) {
            retryCount++;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          }
        }

        if (Object.keys(unprocessedItems).length > 0) {
          throw new Error(`Failed to process all items after ${maxRetries} retries`);
        }
      }

      if (items.LastEvaluatedKey) {
        items = await dynamoDb.send(new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: items.LastEvaluatedKey,
        }));
      } else {
        break;
      }
    }
  } catch (error) {
    console.error("Error resetting DynamoDB table:", error);
    if (error instanceof Error) {
      throw new Error(`Error resetting DynamoDB table: ${error.message}`);
    }
    throw new Error('Unknown error occurred while resetting DynamoDB table');
  }
}


/**
 * Reset the registry by clearing S3 table and the two DynamoDB tables.
 */
export const resetRegistry = async (): Promise<APIGatewayProxyResult> => {
  try {
    //Delete all objects in the S3 bucket
    await deleteAllS3Objects();

    //Delete all items in the two DynamoDB tables
    await resetDynamoDBTable(process.env.PACKAGE_TABLE_NAME, 'PackageID');
    await resetDynamoDBTable(process.env.SCORES_TABLE_NAME, 'id');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Registry reset successful' }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  } catch (error) {
    console.error("Error resetting registry:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
};

//Delete all objects in the S3 bucket using versioned delete
export async function deleteAllS3Objects() {
  try {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    let isTruncated = true;

    while (isTruncated) {
      const listCommand = new ListObjectVersionsCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      });

      const response = await s3.send(listCommand);
      const versions = [...(response.Versions || []), ...(response.DeleteMarkers || [])];

      if (versions.length > 0) {
        // Split into chunks of 1000 (S3 delete limit)
        const chunkSize = 1000;
        for (let i = 0; i < versions.length; i += chunkSize) {
          const chunk = versions.slice(i, i + chunkSize);
          
          // Add retry logic for reliability
          let retries = 3;
          while (retries > 0) {
            try {
              await s3.send(new DeleteObjectsCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Delete: {
                  Objects: chunk.map(version => ({
                    Key: version.Key!,
                    VersionId: version.VersionId!
                  })),
                },
              }));
              break; // Success, exit retry loop
            } catch (err) {
              retries--;
              if (retries === 0) throw err;
              // Exponential backoff
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, 3 - retries) * 1000));
            }
          }
        }
      }

      isTruncated = response.IsTruncated || false;
      keyMarker = response.NextKeyMarker;
      versionIdMarker = response.NextVersionIdMarker;
    }
  } catch (error) {
    console.error('Error deleting objects from versioned S3 bucket:', error);
    throw error;
  }
}
