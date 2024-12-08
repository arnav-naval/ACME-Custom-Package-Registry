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
    let packageDetails;
    try {
      packageDetails = await getPackageFromMainTable(packageId);
    } catch (error) {
      console.error('Error fetching package:', error);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Package does not exist, error: ' + error }),
      };
    }

    if (!packageDetails) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Package does not exist number 2' }),
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
    // Debug log
    console.log('URL before cleaning:', url, typeof url);

    // Get the zip file from the GitHub URL
    const cleanedUrl = await getGithubUrlFromUrl(url);
    
    // Debug log
    console.log('URL after cleaning:', cleanedUrl);
    
    const zip = await getZipFromGithubUrl(cleanedUrl);

    // Upload zip to S3
    const zipBuffer = zip.toBuffer();
    await uploadZipToS3(packageId, zipBuffer);

    // Update URL in the main DynamoDB table with the cleaned URL
    await updateMainTableField(packageId, 'URL', cleanedUrl);
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
      ExpressionAttributeValues: marshall({ 
        ':value': value 
      })
    };

    const command = new UpdateItemCommand(params);
    await dynamoDb.send(command);
    console.info(`Updated ${field} for package ${packageId} in DynamoDB.`);
  } catch (error) {
    console.error(`Error updating ${field} in DynamoDB:`, error);
    throw error;
  }
};


export const getGithubUrlFromUrl = async (url: string): Promise<string> => {
  let githubUrl = url;

  // Handle npm URLs
  if (url.includes("npmjs.com")) {
    try {
      // Extract the package name from the URL
      const packagePath = url.split("npmjs.com/package/")[1];
      if (!packagePath) {
        throw new Error("Invalid npm URL");
      }

      const apiUrl = `https://registry.npmjs.org/${packagePath}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`npm API error: ${response.statusText}`);
      }
      const repoURL = await response.json();

      const repo: string = repoURL ? repoURL.repository.url : null;

      if (!repo) {
        console.info("No repository URL found in npm data");
        throw new Error("No repository URL found in npm data");
      }

      // Update to Github URL
      githubUrl = repo
        .replace("git+", "")
        .replace("git:", "https:")
        .replace(".git", "");
    } catch (err) {
      console.info("Error fetching npm data");
      throw new Error(`Error fetching npm data: ${err.message}`);
    }
  }
  
  // Handle GitHub URLs
  if (url.includes("github.com") || url.includes("raw.githubusercontent.com")) {
    try {
      // Clean up the GitHub URL to ensure it's in the correct format for repository access
      githubUrl = url
        .replace('raw.githubusercontent.com', 'github.com')
        .replace('/blob/', '')
        .replace('/tree/', '')
        .replace(/\/$/, ''); // Remove trailing slash
    } catch (err) {
      console.info("Error processing GitHub URL");
      throw new Error(`Error processing GitHub URL: ${err.message}`);
    }
  }

  // If neither npm nor GitHub, throw error
  if (!url.includes("npmjs.com") && !url.includes("github.com") && !url.includes("raw.githubusercontent.com")) {
    throw new Error("URL must be from either npmjs.com or github.com");
  }

  return githubUrl;
};