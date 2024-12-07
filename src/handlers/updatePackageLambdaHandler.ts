import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { updatePackageController } from '../controllers/updatePackageController.js';

/**
 * Validates the package ID using the specified regex pattern.
 * Ensures it adheres to the schema defined in the specification.
 */
export const validateId = (id: string): boolean => {
  const pattern = '^[a-zA-Z0-9\\-]+$'; // Matches alphanumeric characters and hyphens
  const regex = new RegExp(pattern);
  return regex.test(id);
};

/**
 * The Lambda handler for updating a package.
 * Validates the input, extracts the relevant data, and delegates logic to the controller.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    // Extract `id` from the path parameters
    const packageId = event.pathParameters?.id;

    // Validate the `id` field
    if (!packageId || !validateId(packageId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'There is missing field(s) in the PackageID or it is formed improperly, or is invalid.',
        }),
      };
    }

    // Validate the request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Request body is missing or improperly formatted.',
        }),
      };
    }

    const requestBody = JSON.parse(event.body);

    // Validate that `metadata` and `data` fields exist
    const { metadata, data } = requestBody;
    if (!metadata || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Request body is missing required fields: metadata and data.',
        }),
      };
    }

    // Validate the presence of either `Content` or `URL` in the `data` field
    const hasContent = !!data.Content;
    const hasURL = !!data.URL;

    if (hasContent && hasURL) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Provide either Content or URL, not both.',
        }),
      };
    }

    if (!hasContent && !hasURL) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Either Content or URL must be provided.',
        }),
      };
    }

    // Convert GitHub URLs if present
    if (hasURL) {
      try {
        data.URL = getGithubUrlFromUrl(data.URL);
      } catch (error) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid GitHub URL format.',
          }),
        };
      }
    }

    // Delegate logic to the controller
    const response = await updatePackageController(packageId, metadata, data);
    return response;
  } catch (error) {
    console.error('Error in updatePackageHandler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error.',
      }),
    };
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