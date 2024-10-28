//package controller to define functionality for routes for uploading and downloading packages
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

//initialize S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
});

// Define interface for the query parameters for the generateUploadUrl function
interface UploadPackageBody {
  URL?: string;
  Content?: string;
  JSProgram?: string;
}

// function to upload a package to S3
export const uploadPackageToS3 = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Uploading package to S3');

  // Check if the request body is missing
  if (!event.body) {
    console.log('Missing request body');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  // Parse the request body
  const { URL, Content, JSProgram } = JSON.parse(event.body) as UploadPackageBody;

  if (!URL && !Content && !JSProgram) {
    console.log('Missing URL or Contentin request body');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing URL or content in request body' }),
    };
  }

  // Define the S3 key for the package
  const s3Key = `${URL}`;

  // Define S3 parameters for the presigned URL
  const putObjectParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: s3Key,
    Body: Content,
    ContentType: 'text/plain',
  };

  // Upload the package to S3
  try {
    const command = new PutObjectCommand(putObjectParams);
    await s3.send(command);
    console.info(`Uploaded package to S3`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Package uploaded successfully' }),
    };
  } catch (err) {
    console.log(`Error uploading package to S3: ${err.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error uploading package to S3' }),
    };
  }
};
