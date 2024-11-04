"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPackages = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const dynamoDBClient = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = "Packages";
/**
 * Searches packages using a regular expression on package names and README fields.
 *
 * @param event - API Gateway event containing the regex in the request body
 * @returns APIGatewayProxyResult - List of matching packages or error message
 */
const searchPackages = (event) => __awaiter(void 0, void 0, void 0, function* () {
    try {
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
        // Attempt to compile the regex and catch any errors
        let regexPattern;
        try {
            regexPattern = new RegExp(RegEx, 'i'); // Case-insensitive
        }
        catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid regular expression' }),
            };
        }
        const params = {
            TableName: TABLE_NAME,
            ProjectionExpression: "PackageName, Version, README",
        };
        const result = yield dynamoDBDocClient.send(new lib_dynamodb_1.ScanCommand(params));
        const matchedPackages = (result.Items || []).filter(pkg => regexPattern.test(pkg.PackageName) || (pkg.README && regexPattern.test(pkg.README)));
        if (matchedPackages.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No package found under this regex' }),
            };
        }
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
exports.searchPackages = searchPackages;
//# sourceMappingURL=searchController.js.map