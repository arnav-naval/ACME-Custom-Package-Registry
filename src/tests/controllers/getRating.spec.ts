import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { getPackageRating } from '../../controllers/getRatingController.js'; // Adjust the path to your function


// Mock DynamoDBClient
class MockDynamoDBClient {
    send: jasmine.Spy;

    constructor() {
        this.send = jasmine.createSpy('send');
    }
}

describe('getPackageRating', () => {
    let dynamoDbMock: MockDynamoDBClient;

    beforeEach(() => {
        // Reset the mock before each test
        dynamoDbMock = new MockDynamoDBClient();
        spyOn(DynamoDBClient.prototype, 'send').and.callFake(dynamoDbMock.send);
    });

    it('should return a package rating successfully', async () => {
        // Mock DynamoDB response with AttributeValue format
        dynamoDbMock.send.and.returnValue(
            Promise.resolve({
                Item: {
                    scores: {
                        M: {
                            BusFactor: { N: '0.8' },
                            Correctness: { N: '0.9' },
                            RampUp: { N: '0.7' },
                            ResponsiveMaintainer: { N: '0.85' },
                            LicenseScore: { N: '0.95' },
                            GoodPinningPractice: { N: '0.6' },
                            PullRequest: { N: '1.0' },
                            NetScore: { N: '0.8' },
                        },
                    },
                },
            })
        );

        const packageId = 'test-package';
        const result = await getPackageRating(packageId);

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({
            BusFactor: 0.8,
            Correctness: 0.9,
            RampUp: 0.7,
            ResponsiveMaintainer: 0.85,
            LicenseScore: 0.95,
            GoodPinningPractice: 0.6,
            PullRequest: 1.0,
            NetScore: 0.8,
        });
    });

    it('should return 404 when package is not found', async () => {
        // Mock DynamoDB to return no Item
        dynamoDbMock.send.and.returnValue(Promise.resolve({}));

        const packageId = 'non-existent-package';
        const result = await getPackageRating(packageId);

        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body)).toEqual({ error: 'Package not found' });
    });

    it('should handle internal server errors', async () => {
        // Mock DynamoDB to throw an error
        dynamoDbMock.send.and.throwError('Internal error');

        const packageId = 'error-package';
        const result = await getPackageRating(packageId);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ error: 'Internal Server Error' });
    });

    it('should set missing fields to -1', async () => {
        // Mock response with missing fields
        dynamoDbMock.send.and.returnValue(
            Promise.resolve({
                Item: {
                    scores: {
                        M: {
                            BusFactor: { N: '0.8' },
                            Correctness: { N: '0.9' },
                        },
                    },
                },
            })
        );

        const packageId = 'partial-package';
        const result = await getPackageRating(packageId);

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({
            BusFactor: 0.8,
            Correctness: 0.9,
            RampUp: -1,
            ResponsiveMaintainer: -1,
            LicenseScore: -1,
            GoodPinningPractice: -1,
            PullRequest: -1,
            NetScore: -1,
        });
    });
});
