//package controller to define functionality for routes for uploading and downloading packages
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

// Load environment variables from .env file
dotenv.config();

//initialize S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
});

//Interface for the request body of PackageData
interface PackageData {
  Content?: string;
  URL?: string;
  JSProgram: string;
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
      Key: s3Key,
      Body: buffer,
      'Content-Type': 'application/zip',
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

  //Find the package.json entry
  const packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');

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
    };

    //Upload the base 64 zip to S3 if Content is provided
    if (requestBody.Content) {
      await uploadBase64ZipToS3(requestBody.Content);
    }

    //Return the successful response
    return {
      statusCode: 201,
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
    };
  }
};

//Function to generate S3 key
const generateS3Key = (name: string, version: string): string => {
  return `${name}-${version}`;
};

//Function to handle the base64 upload
export const handleBase64Upload = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' })
      };
    }

    const { base64Content, key } = JSON.parse(event.body);
    
    if (!base64Content || !key) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: base64Content or key' })
      };
    }

    await uploadBase64ZipToS3(base64Content);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Package uploaded successfully' })
    };
  } catch (error) {
    console.error('Error handling base64 upload:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
