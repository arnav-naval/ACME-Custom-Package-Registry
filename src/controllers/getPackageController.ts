import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';

// Initialize clients 
const s3 = new S3Client({
  region: process.env.AWS_REGION,
});
  
const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION,
});
  

