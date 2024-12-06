var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
//package controller to define functionality for routes for uploading and downloading packages
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
/* Parse the incoming regex from the request body.
Scan DynamoDB, applying the regex to filter results by PackageName and README.
Return matching results in a format similar to the provided example response.
*/
// Load environment variables from .env file
dotenv.config();
//initialize S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
});
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = "Packages";
// Function to get package rating
const getPackageRating = (packageID) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield dynamoDBDocClient.send(new GetCommand({
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
    }
    catch (error) {
        console.error('Error retrieving package rating:', error);
        return { statusCode: 500, message: 'Internal server error' };
    }
});
//Function to upload a base64 encoded zip file to S3
export const uploadBase64ZipToS3 = (base64String) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield s3.send(command);
        console.info(`Uploaded base64 encoded zip file to S3`);
    }
    catch (err) {
        console.error(`Error uploading base64 encoded zip file to S3: ${err.message}`);
        throw err;
    }
});
//Function to fetch the package.json from the zip file and throw an error if it is not found  
export const fetchPackageJson = (zip) => {
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
    }
    else {
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
//Function to process the request body of URL, Content, and JSProgram
const validateRequestBody = (body) => {
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
};
// function to upload a package to S3
export const uploadPackageToS3 = (event) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        //Check if request body is missing
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing request body' }),
            };
        }
        //Parse the request body
        const requestBody = JSON.parse(event.body);
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
        };
        //Upload the base 64 zip to S3 if Content is provided
        if (requestBody.Content) {
            yield uploadBase64ZipToS3(requestBody.Content);
        }
        //Return the successful response
        return {
            statusCode: 201,
            body: JSON.stringify({
                metadata,
                data: requestBody
            })
        };
    }
    catch (err) {
        //Internal server error
        console.error(`Error processing package upload: ${err.message}`);
        return {
            statusCode: 500, //change to 400 as per spec
            body: JSON.stringify({ error: 'Error processing package upload' }),
        };
    }
});
//Function to generate S3 key
const generateS3Key = (name, version) => {
    return `${name}-${version}`;
};
//Function to handle the base64 upload
export const handleBase64Upload = (event) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield uploadBase64ZipToS3(base64Content);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Package uploaded successfully' })
        };
    }
    catch (error) {
        console.error('Error handling base64 upload:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
});
export const searchPackages = (event) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Ensure body contains the regex
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing request body' }),
            };
        }
        const { RegEx } = JSON.parse(event.body);
        if (!RegEx) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid or missing RegEx field' }),
            };
        }
        // Compile the regex pattern
        const regexPattern = new RegExp(RegEx, 'i'); // Case-insensitive
        // Scan DynamoDB for potential matches
        const params = {
            TableName: TABLE_NAME,
            ProjectionExpression: "PackageName, Version, README", // Retrieve only necessary fields
        };
        const result = yield dynamoDBDocClient.send(new ScanCommand(params));
        const matchedPackages = (result.Items || []).filter(pkg => regexPattern.test(pkg.PackageName) || (pkg.README && regexPattern.test(pkg.README)));
        // If no matches found, return 404
        if (matchedPackages.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No package found under this regex' }),
            };
        }
        // Format and return the matched packages
        const response = matchedPackages.map(pkg => ({
            Name: pkg.PackageName,
            Version: pkg.Version,
        }));
        return {
            statusCode: 200,
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error("Error searching packages by RegEx:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
});
//# sourceMappingURL=packageController.js.map