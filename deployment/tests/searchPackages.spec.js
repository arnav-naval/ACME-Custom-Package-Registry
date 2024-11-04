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
const searchController_1 = require("../controllers/searchController");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
describe('searchPackages', () => {
    let sendSpy;
    beforeEach(() => {
        sendSpy = spyOn(lib_dynamodb_1.DynamoDBDocumentClient.prototype, 'send');
    });
    it('should return matching packages when valid RegEx is provided', () => __awaiter(void 0, void 0, void 0, function* () {
        // Mock DynamoDB response with items matching the regex pattern
        sendSpy.and.returnValue(Promise.resolve({
            Items: [
                { PackageName: 'Underscore', Version: '1.2.3', README: 'A useful library' },
                { PackageName: 'Lodash', Version: '1.2.3-2.1.0', README: 'A similar library' }
            ]
        }));
        const event = { body: JSON.stringify({ RegEx: '.*?Underscore.*|.*?Lodash.*' }) };
        const result = yield (0, searchController_1.searchPackages)(event);
        // Check that we have two items in the result and they match exactly
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual([
            { Name: 'Underscore', Version: '1.2.3' },
            { Name: 'Lodash', Version: '1.2.3-2.1.0' }
        ]);
    }));
    it('should return 404 if no packages match the regex', () => __awaiter(void 0, void 0, void 0, function* () {
        sendSpy.and.returnValue(Promise.resolve({ Items: [] })); // No matches
        const event = { body: JSON.stringify({ RegEx: 'NonExistentPackage' }) };
        const result = yield (0, searchController_1.searchPackages)(event);
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body)).toEqual({ error: 'No package found under this regex' });
    }));
    it('should return 400 if RegEx field is missing', () => __awaiter(void 0, void 0, void 0, function* () {
        const event = { body: JSON.stringify({}) }; // Missing RegEx field
        const result = yield (0, searchController_1.searchPackages)(event);
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Invalid or missing RegEx field' });
    }));
    it('should return 400 if request body is missing', () => __awaiter(void 0, void 0, void 0, function* () {
        const event = {}; // No body in event
        const result = yield (0, searchController_1.searchPackages)(event);
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Missing request body' });
    }));
    it('should handle invalid regex patterns gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
        const event = { body: JSON.stringify({ RegEx: '[' }) }; // Invalid regex pattern
        const result = yield (0, searchController_1.searchPackages)(event);
        // Check that the response code is 400 and the error message is correct
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: 'Invalid regular expression' });
    }));
    it('should return 500 if DynamoDB scan fails', () => __awaiter(void 0, void 0, void 0, function* () {
        sendSpy.and.returnValue(Promise.reject(new Error('DynamoDB error')));
        const event = { body: JSON.stringify({ RegEx: '.*' }) };
        const result = yield (0, searchController_1.searchPackages)(event);
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
    }));
});
//# sourceMappingURL=searchPackages.spec.js.map