import { APIGatewayProxyHandler } from "aws-lambda";
import { fetchPackageVersions } from "../controllers/fetchPackageVersionsController";

export const handler: APIGatewayProxyHandler = async (event) => {
  const id = event.pathParameters?.id;
  const versionRange = event.queryStringParameters?.versionRange;

  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Package ID is required" }),
    };
  }

  return await fetchPackageVersions(id, versionRange);
};
