import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import AdmZip from 'adm-zip';
import { getZipFromGithubUrl } from './packageController.js'; // Replace with actual imports
import { getPackageFromMainTable } from './getPackageController.js';

// Initialize DynamoDB and S3 clients
const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });

export interface PackageResponse {
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

export const updatePackageController = async (packageId: string, metadata: any, data: any) => {
  try {
    // Fetch package from the main table
    const packageDetails = await getPackageFromMainTable(packageId);

    if (!packageDetails) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Package does not exist.' }),
      };
    }

    // Validate name and version
    if (metadata.Name !== packageDetails.metadata.Name || metadata.Version !== packageDetails.metadata.Version) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Name or version does not match the existing package.' }),
      };
    }

    // Handle URL update
    if (data.URL) {
      console.log('Updating URL...');
      await handleUrlUpdate(packageId, data.URL);
    }

    // Handle Content update
    if (data.Content) {
      console.log('Updating Content...');
      await handleContentUpdate(packageId, data.Content);
    }

    // Success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Version is updated.',
      }),
    };
  } catch (error) {
    console.error('Error in updatePackageController:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' }),
    };
  }
};

export const handleUrlUpdate = async (packageId: string, url: string) => {
  try {
    // Get the zip file from the GitHub URL
    const zip = await getZipFromGithubUrl(url);

    // Upload zip to S3
    const zipBuffer = zip.toBuffer();
    await uploadZipToS3(packageId, zipBuffer);

    // Update URL in the main DynamoDB table
    await updateMainTableField(packageId, 'URL', url);
  } catch (error) {
    console.error('Error handling URL update:', error);
    throw error;
  }
};
  
  /**
   * Handles the Content update by decoding and uploading to S3.
   */
export const handleContentUpdate = async (packageId: string, content: string) => {
  try {
    // Decode Base64 content into a buffer
    const buffer = Buffer.from(content, 'base64');

    // Create a zip object
    const zip = new AdmZip(buffer);

    // Upload zip to S3
    const zipBuffer = zip.toBuffer();
    await uploadZipToS3(packageId, zipBuffer);
  } catch (error) {
    console.error('Error handling Content update:', error);
    throw error;
  }
};
  
/**
 * Uploads a zip file buffer to S3.
 */
export const uploadZipToS3 = async (packageId: string, zipBuffer: Buffer) => {
  try {
    const params = {
      Bucket: process.env.BUCKET_NAME,
      Key: `${packageId}.zip`,
      Body: zipBuffer,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);
    console.info(`Uploaded package ${packageId} to S3.`);
  } catch (error) {
    console.error('Error uploading zip to S3:', error);
    throw error;
  }
};

export const updateMainTableField = async (packageId: string, field: string, value: any) => {
  try {
    const params = {
      TableName: process.env.PACKAGES_TABLE_NAME,
      Key: marshall({ PackageID: packageId }),
      UpdateExpression: `SET #field = :value`,
      ExpressionAttributeNames: { '#field': field },
      ExpressionAttributeValues: { ':value': value },
    };

    const command = new UpdateItemCommand(params);
    await dynamoDb.send(command);
    console.info(`Updated ${field} for package ${packageId} in DynamoDB.`);
  } catch (error) {
    console.error(`Error updating ${field} in DynamoDB:`, error);
    throw error;
  }
};