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
exports.handler = void 0;
const packageController_js_1 = require("../controllers/packageController.js");
const handler = (event, context) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Check the route path and HTTP method to determine action
        if (event.httpMethod === 'POST' && event.path === '/upload') {
            return yield (0, packageController_js_1.uploadPackageToS3)(event);
        }
        else if (event.httpMethod === 'GET' && event.path === '/search') {
            return yield (0, packageController_js_1.searchPackages)(event);
        }
        else {
            // Return a 404 response if the route is not recognized
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Route not found' }),
            };
        }
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An unexpected error occurred' }),
        };
    }
});
exports.handler = handler;
//# sourceMappingURL=lambdaHandler.js.map