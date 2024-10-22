//package controller to define functionality for routes for uploading and downloading packages
import { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { info, debug } from '../logger.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

//initialize S3 client
const s3 = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    region: process.env.AWS_REGION,
});

// Define interface for the query parameters for the generateUploadUrl function
interface UploadUrlQuery {
  fileName?: string;
  fileType?: string;
}

// Function to generate a presigned URL for uploading a package
export const generateUploadUrl = async (req: Request<Record<string, never>, Record<string, never>, Record<string, never>, UploadUrlQuery>, res: Response): Promise<void> => {
  await info('Generating upload URL');
  // Extract fileName and fileType from the query parameters
  const { fileName, fileType } = req.query;

  // Check if fileName and fileType are provided
  if (!fileName || !fileType) {
    await info('Missing fileName or fileType in query');
    res.status(400).json({ error: 'Missing fileName or fileType' });
    return;
  }

  // Define S3 parameters for the presigned URL
  const putObjectParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  };

  // Generate the presigned URL
  try {
    const command = new PutObjectCommand(putObjectParams);
    const url = await getSignedUrl(s3, command, {
        expiresIn: 60,
    });
    await debug(`Generated upload URL for ${fileName}`);
    res.status(200).json({ url });
  } catch (err) {
    await info(`Error generating upload URL: ${err.message}`);
    res.status(500).json({ error: 'Error generating upload URL' });
  }
};
