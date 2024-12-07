import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Initialize clients 
const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

//Create a package response interface
interface PackageResponse {
  metadata: {
    Name: string;
    Version: string;
    ID: string;
  }
  data: {
    Content?: string;
    URL?: string;
    JSProgram: string;
  }
}

//Function that gets a package from the main table
export const getPackage = async (packageId: string): Promise<APIGatewayProxyResult> => {
  try {
    const packageResponse = await getPackageFromMainTable(packageId);
    
    return {
      statusCode: 200,
      body: JSON.stringify(packageResponse),
    };
    
  } catch (error) {
    // Handle known errors
    if (error.message === 'Package not found') {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Package does not exist' }),
      };
    }

    // Log and handle unexpected errors
    console.error('Error getting package:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

//Function that gets a package from the main table from the packageId, and returns all non-null fields
export const getPackageFromMainTable = async (packageId: string): Promise<PackageResponse> => {
  try {
    const params = {
      TableName: process.env.PACKAGES_TABLE_NAME,
      Key: marshall({ PackageID: packageId }),
    };

    const result = await dynamoDb.send(new GetItemCommand(params));

    if (!result.Item) {
      throw new Error('Package not found');
    }

    const item = unmarshall(result.Item);

    //Construct response object with only non-null fields in data
    const packageResponse: PackageResponse = {
      metadata: {
        Name: item.Name,
        Version: item.Version,
        ID: item.PackageID,
      },
      data: {
        JSProgram: item.JSProgram,
      }
    }

    // If URL exists, use it. Otherwise, fetch content from S3
    if (item.URL) {
      packageResponse.data.URL = item.URL;
    } else {
      packageResponse.data.Content = await getContentFromS3(packageId);
    }
  
    return packageResponse;
  } catch (error) {
    console.error('Error getting package from main table:', error);
    throw error;
  }
}

// Add new function to handle S3 content retrieval
async function getContentFromS3(packageId: string): Promise<string> {
  try {
    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: packageId,
    }));

    if (!s3Response.Body) {
      throw new Error('No content found in S3');
    }

    const contentBuffer = await s3Response.Body.transformToByteArray();
    return Buffer.from(contentBuffer).toString('base64');
  } catch (error) {
    console.error('Error retrieving content from S3:', error);
    throw new Error('Failed to retrieve package content');
  }
}
  

