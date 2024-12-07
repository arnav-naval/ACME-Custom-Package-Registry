var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fetch from 'node-fetch';
import { netScore } from './metric_score';
// Function to fetch npm package data
function fetchNpmPackageData(packageName) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiUrl = `https://registry.npmjs.org/${packageName}`;
        const response = yield fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Error fetching package data: ${response.statusText}`);
        }
        const packageData = yield response.json();
        // Check if repository exists before accessing it
        if (!packageData.repository || !packageData.repository.url) {
            throw new Error('Repository URL not found in the package data');
        }
        return packageData;
    });
}
// Function to check if the package meets minimum score requirements
function checkPackageRating(repoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        // Fetch the netScore and metrics for the given repository URL
        const rating = yield netScore(repoUrl);
        // Define the required metrics and their minimum threshold values
        const requiredMetrics = {
            BusFactor: 0.5,
            Correctness: 0.5,
            RampUp: 0.5,
            ResponsiveMaintainer: 0.5,
            License: 0.5,
        };
        // Check if each required metric meets the minimum score
        for (const [metric, minValue] of Object.entries(requiredMetrics)) {
            if (rating[metric] < minValue) {
                throw new Error(`Package does not meet the minimum score for ${metric}. Score: ${rating[metric]}, required: ${minValue}`);
            }
        }
        // If all metrics meet the minimum requirements, return true
        return true;
    });
}
// Function to upload package to registry
function uploadPackageToRegistry(packageData) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiUrl = '/upload-endpoint'; // Update with actual endpoint
        const response = yield fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(packageData),
        });
        if (!response.ok) {
            throw new Error('Error uploading package');
        }
        return response.json();
    });
}
// Ingestion process
export function ingestPackage(packageName) {
    return __awaiter(this, void 0, void 0, function* () {
        const packageData = yield fetchNpmPackageData(packageName);
        // Extract repository URL and clean it up
        const repoUrl = packageData.repository.url.replace('git+', '').replace('.git', '');
        // Check if the package meets the rating requirements
        yield checkPackageRating(repoUrl);
        // Upload package to the registry
        return uploadPackageToRegistry(packageData);
    });
}
// Example usage
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield ingestPackage('express'); // Example package
        console.log('Package uploaded successfully:', result);
    }
    catch (error) {
        console.error('Error:', error.message);
    }
}))();
//# sourceMappingURL=ingestPackage.js.map