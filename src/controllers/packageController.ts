//package controller to define functionality for routes for uploading and downloading packages
<<<<<<< HEAD
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { netScore } from '../metric_score.js';
import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
=======
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

/* Parse the incoming regex from the request body.
Scan DynamoDB, applying the regex to filter results by PackageName and README.
Return matching results in a format similar to the provided example response.
*/

// Load environment variables from .env file
dotenv.config();
>>>>>>> feature/package-rating

//initialize S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

<<<<<<< HEAD
//initialize dynamoDB client
const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION,
})

//Interface for the request body of PackageData
export interface PackageData {
  Content?: string;
  URL?: string;
  JSProgram: string;
}

//Function to generate a unique package id
const generatePackageId = (name: string, version: string): string => {
  return createHash('sha256').update(`${name}-${version}`).digest('hex');
};

//Getting package zip file from npm or github url
export const getGithubUrlFromUrl = async (url: string): Promise<string> => {
  //Asssume we are given a valid npm or github url, return the github url
  let githubUrl = url;
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

  //Return the github url
  return githubUrl;
};

//Function to get the zip file from the github url
export const getZipFromGithubUrl = async (githubUrl: string): Promise<AdmZip> => {
  try {
    // Get repo info to find the default branch name
    const apiUrl = githubUrl
      .replace('github.com', 'api.github.com/repos')
      .replace(/\/$/, '');
    
    const repoResponse = await fetch(apiUrl);
    if (!repoResponse.ok) {
      throw new Error('Failed to fetch repository info');
    }
    
    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;
    
    // Download zip and convert directly to buffer
    const zipUrl = `${githubUrl}/archive/refs/heads/${defaultBranch}.zip`;
    const zipResponse = await fetch(zipUrl);
    if (!zipResponse.ok) {
      throw new Error('Failed to download zip file');
    }
    //Convert the zip response to a buffer
    const buffer = Buffer.from(await zipResponse.arrayBuffer());
    //Create an AdmZip object from the buffer
    return new AdmZip(buffer);
  } catch (error) {
    throw new Error(`Failed to download GitHub repository: ${error.message}`);
  }
};


//Function to upload a base64 encoded zip file to S3
export const uploadBase64ZipToS3 = async (base64String: string): Promise<void> => {
  try {
    //Decode base64 string to buffer
    const buffer = Buffer.from(base64String, 'base64');

    //Create a zip object from the buffer
    const zip = new AdmZip(buffer);

    //Fetch the name and version from the package.json
    const { name, version } = fetchPackageJson(zip);

    //Generate the S3 key
    //const s3Key = generateS3Key(name, version);
    const packageId = generatePackageId(name, version);
    //Set up s3 upload parameters
    const putObjectParams = {
      Bucket: process.env.BUCKET_NAME,
      Key: `${packageId}.zip`, //only adding zip to key changes file type in S3 bucket
      Body: buffer,
      Metadata: {
        Name: name,
        Version: version,
      }
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

//Function to fetch the package.json from the zip file and throw an error if it is not found  
export const fetchPackageJson = (zip: AdmZip): { name: string, version: string } => {
  //Get all entries from the zip file
  const zipEntries = zip.getEntries();

  //First try to find root-level package.json
  let packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');

  //If not found at root, look for any package.json
  if (!packageJsonEntry) {
    packageJsonEntry = zipEntries.find(entry => entry.entryName.endsWith('package.json'));
  }

  //Throw an error if package.json is not found
  if (!packageJsonEntry) {
    throw new Error('Package.json not found in the zip file');
  }
 
  //Get the content of the package.json entry
  const packageJsonContent = packageJsonEntry.getData().toString('utf8');
  //Return the parsed package.json content
  const packageJson = JSON.parse(packageJsonContent);

  //If version is not present, sei it to "1.0.0"
  let version;
  if (!packageJson.version) {
    version = "1.0.0";
  } else {
    version = packageJson.version;
  }

  //If name is not present, throw an error
  if (!packageJson.name) {
    throw new Error('Name is not present in the package.json file');
  }

  //Return the name and version
  return {
    name: packageJson.name,
    version: version,
  };
};

//Function to upload the zip file to S3 from a github url
export const uploadURLZipToS3 = async (githubUrl: string): Promise<void> => {
  try {
    //Get the github url from the URL provided
    const url = await getGithubUrlFromUrl(githubUrl);
    
    //Get the zip file from the github url
    const zip = await getZipFromGithubUrl(url);
    
    //Fetch the name and version from the package.json
    const { name, version } = fetchPackageJson(zip);
    
    //Generate the S3 key
    const packageId = generatePackageId(name, version);

    //Set up s3 upload parameters
    const putObjectParams = {
      Bucket: process.env.BUCKET_NAME,
      Key: `${packageId}.zip`,
      Body: zip.toBuffer(), 
      Metadata: {
        Name: name,
        Version: version,
      }
    };

    //Upload the buffer to S3
    const command = new PutObjectCommand(putObjectParams);
    await s3.send(command);
    console.info(`Successfully uploaded package ${name}@${version} to S3`);
  } catch (error) {
    console.error(`Error uploading URL package to S3: ${error.message}`);
    throw new Error(`Failed to upload package from URL: ${error.message}`);
  };
};

const packageExists = async (packageId: string): Promise<boolean> => {
  try {
    console.log('Checking if package exists in S3 bucket');
    //Check if package already exists in S3 bucket
    const command = new HeadObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: `${packageId}.zip`,
    });
    await s3.send(command);
    console.log('Package exists in S3 bucket');
    return true; //Object exists
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log('Package does not exist in S3 bucket');
      return false; //Object does not exist
    }
    throw error;
  }
};

// function to upload a package to S3
export const uploadPackage = async (requestBody: PackageData): Promise<APIGatewayProxyResult> => {
  try {
    //Fetch name and version from package json (repeated work)
    let zip: AdmZip;
    let name: string;
    let version: string;
    if (requestBody.Content) {
      const tempBuffer = Buffer.from(requestBody.Content, 'base64');
      zip = new AdmZip(tempBuffer);
      ({ name, version } = fetchPackageJson(zip));
    }
    else {
      const url = await getGithubUrlFromUrl(requestBody.URL);
      zip = await getZipFromGithubUrl(url);
      ({ name, version } = fetchPackageJson(zip));
    }
    const packageId = generatePackageId(name, version);

    //Check if package already exists in S3 bucket
    if (await packageExists(packageId)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Package exists already' })
      };
    }
  
    //Check the package rating
    const packageRatingScore = await checkPackageRating(requestBody);
    console.log('Package rating score:', packageRatingScore);
    
    // Add error handling
    if ('statusCode' in packageRatingScore && packageRatingScore.statusCode === 424 && requestBody.URL) {
      return {
        statusCode: packageRatingScore.statusCode,
        body: packageRatingScore.body
      };
    }

    //Generate metadata
    const metadata = {
      Name: name,
      Version: version,
      ID: packageId,
=======
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = "Packages";

//Interface for the request body of PackageData
interface PackageData {
  Content?: string;
  URL?: string;
  JSProgram: string;
  packageID: string;
}

interface PackageMetadata {
  Name: string;
  Version: string;
  ID: string;
}

interface PackageResponse {
  metadata: PackageMetadata;
  data: PackageData;
}

// Function to get package rating
const getPackageRating = async (packageID) => {
  try {
    const result = await dynamoDBDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PackageID: packageID },
    }));

    if (!result.Item) {
      return { statusCode: 404, message: 'Package does not exist' };
    }

    const rating = result.Item.rating;

    if (rating === undefined || rating === null) {
      return { statusCode: 500, message: 'The package rating system choked on at least one of the metrics' };
    }

    // Assuming a rating below a threshold is disqualified
    const isDisqualified = rating < 3; // Adjust threshold as needed
    return { statusCode: isDisqualified ? 424 : 200, rating };
  } catch (error) {
    console.error('Error retrieving package rating:', error);
    return { statusCode: 500, message: 'Internal server error' };
  }
};

//Function to upload a base64 encoded zip file to S3
export const uploadBase64ZipToS3 = async (base64String: string): Promise<void> => {
  try {
    //Decode base64 string to buffer
    const buffer = Buffer.from(base64String, 'base64');

    //Create a zip object from the buffer
    const zip = new AdmZip(buffer);

    //Fetch the name and version from the package.json
    const { name, version } = fetchPackageJson(zip);

    //Generate the S3 key
    const s3Key = generateS3Key(name, version);

    //Set up s3 upload parameters
    const putObjectParams = {
      Bucket: process.env.BUCKET_NAME,
      Key: `${s3Key}.zip`, //only adding zip to key changes file type in S3 bucket
      Body: buffer,
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

//Function to fetch the package.json from the zip file and throw an error if it is not found  
export const fetchPackageJson = (zip: AdmZip): { name: string, version: string } => {
  //Get all entries from the zip file
  const zipEntries = zip.getEntries();

  //First try to find root-level package.json
  let packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');

  //If not found at root, look for any package.json
  if (!packageJsonEntry) {
    packageJsonEntry = zipEntries.find(entry => entry.entryName.endsWith('package.json'));
  }

  //Throw an error if package.json is not found
  if (!packageJsonEntry) {
    throw new Error('Package.json not found in the zip file');
  }
 
  //Get the content of the package.json entry
  const packageJsonContent = packageJsonEntry.getData().toString('utf8');
  //Return the parsed package.json content
  const packageJson = JSON.parse(packageJsonContent);

  //If version is not present, sei it to "1.0.0"
  let version;
  if (!packageJson.version) {
    version = "1.0.0";
  } else {
    version = packageJson.version;
  }

  //If name is not present, throw an error
  if (!packageJson.name) {
    throw new Error('Name is not present in the package.json file');
  }

  //Return the name and version
  return {
    name: packageJson.name,
    version: version,
  };
}

//Function to process the request body of URL, Content, and JSProgram
const validateRequestBody = (body: PackageData): { isValid: boolean, error?: string } => {
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
  try {
    //Check if request body is missing
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    //Parse the request body
    const requestBody = JSON.parse(event.body) as PackageData;
    const validationResult = validateRequestBody(requestBody);
    const { packageID, Content, JSProgram } = requestBody;

    //Check if validation fails
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validationResult.error }),
      };
    }

    // TODO: Check if package exists
    // if (packageExists) {
    //   return {
    //     statusCode: 409,
    //     body: JSON.stringify({ error: 'Package exists already' })
    //   };
    // }

    // TODO: Check package rating
    // if (packageRatingDisqualified) {
    //   return {
    //     statusCode: 424,
    //     body: JSON.stringify({ error: 'Package is not uploaded due to the disqualified rating' })
    //   };
    // }

    //Generate metadata
    const metadata = {
      Name: "extracted-name",
      Version: "extracted-version",
      ID: "generated-id"
>>>>>>> feature/package-rating
    };

    //Upload the base 64 zip to S3 if Content is provided
    if (requestBody.Content) {
<<<<<<< HEAD
      console.log('Uploading base64 package to S3');
      await uploadBase64ZipToS3(requestBody.Content);
    }
    //Else URL must be provided
    else {
      console.log('Uploading URL package to S3');
      await uploadURLZipToS3(requestBody.URL);
    }

    //Since we havent exited, save package scores to dynamoDb
    try {
      await uploadPackageMetadataToScoresTable(packageRatingScore, packageId);
    } catch (error) {
      //delete package from S3 bucket
      await deletePackageFromS3(packageId);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error uploading package scores to dynamoDB' })
      };
    }

    //Upload package metadata to main table
    try {
      const readmeContent = extractReadmeContent(zip);
      await uploadPackageMetadataToMainTable(packageId, name, version, readmeContent, requestBody);
    } catch (error) {
      //delete package from S3 bucket
      await deletePackageFromS3(packageId);
      //delete scores row from dynamoDB
      await deleteScoresFromDynamoDB(packageId);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error uploading package metadata to main table' })
      };
    }
=======
      await uploadBase64ZipToS3(requestBody.Content);
    }
>>>>>>> feature/package-rating

    //Return the successful response
    return {
      statusCode: 201,
<<<<<<< HEAD
      body: JSON.stringify({metadata: metadata, data: requestBody})
    };
  } catch (err) {
    console.error('Error processing package upload:', err);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : 'Error processing package upload'
      }),
=======
      body: JSON.stringify({
        metadata,
        data: requestBody
      })
    };
  } catch (err) {
    //Internal server error
    console.error(`Error processing package upload: ${err.message}`);
    return {
      statusCode: 500, //change to 400 as per spec
      body: JSON.stringify({ error: 'Error processing package upload' }),
>>>>>>> feature/package-rating
    };
  }
};

<<<<<<< HEAD
const deletePackageFromS3 = async (packageId: string): Promise<void> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: `${packageId}.zip`,
    });
    await s3.send(command);
    console.info(`Successfully deleted package ${packageId} from S3`);
  } catch (error) {
    console.error(`Error deleting package ${packageId} from S3:`, error);
    throw new Error(`Failed to delete package from S3: ${error.message}`);
  }
};

//Function to delete the scores row for specific package ID from dynamoDB
const deleteScoresFromDynamoDB = async (packageId: string): Promise<void> => {
  try {
    const command = new DeleteItemCommand({
      TableName: process.env.SCORES_TABLE_NAME,
      Key: marshall({ id: packageId }),
    });
    await dynamoDb.send(command);
    console.info(`Successfully deleted package ${packageId} scores from dynamoDB`);
  } catch (error) {
    console.error(`Error deleting package ${packageId} scores from dynamoDB:`, error);
    throw new Error(`Failed to delete package scores from dynamoDB: ${error.message}`);
  }
}

//Function to validate the score and ensure all scores are above 0.5
const validateScore = (score: any): boolean => {
  const lim = 0;
  return score.BusFactor >= lim && score.Correctness >= lim && score.RampUp >= lim && score.ResponsiveMaintainer >= lim && score.LicenseScore >= lim && score.GoodPinningPractice >= lim && score.PullRequest >= lim;
};

//Function to get the github url from the zip file
const getGithubUrlFromZip = async (zip: AdmZip): Promise<string> => {
  const zipEntries = zip.getEntries();
  let packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');

  if (!packageJsonEntry) {
    throw new Error('Package.json not found in the zip file');
  }
 
  const packageJsonContent = packageJsonEntry.getData().toString('utf8');
  const packageJson = JSON.parse(packageJsonContent);
  //Check if repository field is present (URL)
  if (!packageJson.repository) {
    throw new Error('Repository field not found in package.json');
  }

  // Handle both string and object repository formats
  const repoUrl = typeof packageJson.repository === 'string' 
    ? packageJson.repository 
    : packageJson.repository.url;

  if (!repoUrl) {
    throw new Error('Repository URL not found in package.json');
  }

  // Clean up the URL similar to getGithubUrlFromUrl function
  return repoUrl
    .replace("git+", "")
    .replace("git:", "https:")
    .replace(".git", "");
};

const checkPackageRating = async (requestBody: PackageData): Promise<any> => {
  //if requestBody.URL is provided, check the rating of the package from the url else check from requestBody.Content
  try {
    if (requestBody.URL) {
      //check the rating of the package from the url
      const url = await getGithubUrlFromUrl(requestBody.URL);
      const score = await netScore(url);
      const validScore = validateScore(score);
      if (!validScore) {
        return {
          statusCode: 424,
          body: JSON.stringify({ error: 'Package is not uploaded due to the disqualified rating' })
        };
      }
      return score;
    } else {
      //check the rating of the package from the requestBody.Content
      const tempBuffer = Buffer.from(requestBody.Content, 'base64');
      const zip = new AdmZip(tempBuffer);
      const url = await getGithubUrlFromZip(zip);
      const score = await netScore(url);
      const validScore = validateScore(score);
      if (!validScore) {
        return {
          statusCode: 424,
          body: JSON.stringify({ error: 'Package is not uploaded due to the disqualified rating' })
        };
      }
      return score;
    }
  } catch (error) {
    console.error('Error checking package rating:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Error checking package rating, package could not be uploaded' })
    };
  }
};

//Function to upload package scores and S3 data to dynamoDB database
const uploadPackageMetadataToScoresTable= async (scores: any, packageId: string): Promise<void> => {
  try {
    // Log the incoming scores object
    console.log('Raw scores object:', JSON.stringify(scores, null, 2));

    const item = {
      id: packageId,
      timestamp: new Date().toISOString(),
      scores: {
        NetScore: scores.NetScore,
        BusFactor: scores.BusFactor,
        Correctness: scores.Correctness,
        RampUp: scores.RampUp,
        ResponsiveMaintainer: scores.ResponsiveMaintainer,
        LicenseScore: scores.LicenseScore,
        GoodPinningPractice: scores.GoodPinningPractice,
        PullRequest: scores.PullRequest,
      }
    };

    // Log the constructed item
    console.log('Constructed item:', JSON.stringify(item, null, 2));

    const params = {
      TableName: process.env.SCORES_TABLE_NAME,
      Item: marshall(item),
    };

    const command = new PutItemCommand(params);
    await dynamoDb.send(command);
    console.info(`Successfully uploaded package ${packageId} scores to dynamoDB`);
  } catch (error) {
    console.error('Error uploading package scores to dynamoDB:', error);
    throw new Error('Error uploading package scores to dynamoDB');
  }
};

//Function to upload package metadata to main table
const uploadPackageMetadataToMainTable = async (packageId: string, name: string, version: string, readmeContent: string, requestBody: PackageData) => {
  try {
    const item = {
      PackageID: packageId,
      Name: name,
      Version: version,
      timestamp: new Date().toISOString(),
      URL: requestBody.URL || null,
      JSProgram: requestBody.JSProgram || null,
      ReadMe: readmeContent,
    }

    const params = {
      TableName: process.env.PACKAGES_TABLE_NAME,
      Item: marshall(item),
    };

    const command = new PutItemCommand(params);
    await dynamoDb.send(command);
    console.info(`Successfully uploaded package ${packageId} to main table`);
  } catch (error) {
    console.error('Error uploading package to main table:', error);
    throw new Error('Error uploading package to main table');
  }
}

//Function to get the readme content from the zip file
export const extractReadmeContent = (zip: AdmZip): string => {
  //Max length (under 400kb for dynamodb storage)
  const MAX_README_LENGTH = 360000;
  const zipEntries = zip.getEntries();

  // Ordered patterns from highest to lowest priority
  const readmePatterns = [
    /^README\.md$/i,      // 1. Root README.md
    /^README$/i,          // 2. Root README
    /^README\.txt$/i,     // 3. Root README.txt
    /.*\/README\.md$/i,   // 4. Nested README.md
    /.*\/README$/i,       // 5. Nested README
    /.*\/README\.txt$/i   // 6. Nested README.txt
  ];

  // Check patterns in priority order
  for (const pattern of readmePatterns) {
    const readmeEntry = zipEntries.find(entry => pattern.test(entry.entryName));
    if (readmeEntry) {
      const content = readmeEntry.getData().toString('utf8');
      return content.slice(0, MAX_README_LENGTH);
    }
  }

  return '';
=======
//Function to generate S3 key
const generateS3Key = (name: string, version: string): string => {
  return `${name}-${version}`;
>>>>>>> feature/package-rating
};
