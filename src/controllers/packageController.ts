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

//Function to upload a base64 encoded zip file to S3
export const uploadBase64ZipToS3 = async (base64String: string, s3Key: string): Promise<void> => {
  try {
    //Decode base64 string to buffer
    const buffer = Buffer.from(base64String, 'base64');

    //Set up s3 upload parameters
    const putObjectParams = {
      Bucket: process.env.BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/zip',
    };

    //Upload the buffer to S3
    const command = new PutObjectCommand(putObjectParams);
    await s3.send(command);
    console.info(`Uploaded base64 encoded zip file to S3`);
  } catch (err) {
    console.error(`Error uploading base64 encoded zip file to S3: ${err.message}`);
    throw err;
  }
};

//Function to process the request body of URL, Content, and JSProgram
const validateRequestBody = (body: UploadPackageBody): { isValid: boolean, error?: string } => {
  //Check if all required fields are presen
  if (!body.URL && !body.Content && !body.JSProgram) {
    return {
      isValid: false,
      error: 'Missing required fields: URL, Content, or JSProgram',
    };
  }

   // Check if either URL or Content is provided
   if (!body.URL && !body.Content) {
    return {
      isValid: false,
      error: 'Missing required fields: Must provide either URL or Content',
    };
  }

  //Check if JSProgram is provided
  if (!body.JSProgram) {
    return {
      isValid: false,
      error: 'Missing required fields: JSProgram',
    };
  }

  // Check if both URL and Content are provided (not allowed)
  if (body.URL && body.Content) {
    return {
      isValid: false,
      error: 'Cannot provide both URL and Content fields',
    };
  }

  //If all checks pass, return true
  return {
    isValid: true,
  };
  
}



// function to upload a package to S3
export const uploadPackageToS3 = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Check if the request body is missing
  if (!event.body) {
    console.log('Missing request body');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  // Parse the request body
  const requestBody = JSON.parse(event.body) as UploadPackageBody;
  const validationResult = validateRequestBody(requestBody);

  //If validation fails, return the error message
  if (!validationResult.isValid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: validationResult.error }),
    };
  }

  // Define the S3 key for the package
  const s3Key = `${requestBody.URL}`;

  // Define S3 parameters for the presigned URL
  const putObjectParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: s3Key,
    Body: "tester",
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
