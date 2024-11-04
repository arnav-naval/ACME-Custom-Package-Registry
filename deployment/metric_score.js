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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.netScore = netScore;
exports.busFactorScore = busFactorScore;
exports.correctnessScore = correctnessScore;
exports.pinnedDependenciesScore = pinnedDependenciesScore;
exports.pullRequestReviewScore = pullRequestReviewScore;
exports.rampUpScore = rampUpScore;
exports.responsivenessScore = responsivenessScore;
exports.licenseScore = licenseScore;
exports.fetchGitHubData = fetchGitHubData;
exports.fetchIssues = fetchIssues;
exports.fetchCollaboratorsCount = fetchCollaboratorsCount;
exports.fetchRepoContents = fetchRepoContents;
const logger_js_1 = require("./logger.js");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
// Function to calculate score and latency for each metric
const measureLatency = (fn, label) => __awaiter(void 0, void 0, void 0, function* () {
    const start = Date.now();
    const score = yield fn();
    const latency = Date.now() - start;
    return { score, latency, label };
});
// takes as input URL and returns a score
function netScore(url) {
    return __awaiter(this, void 0, void 0, function* () {
        let data, openIssues, closedIssues;
        // convert npm URL to GitHub URL
        if (url.includes("npmjs.com")) {
            try {
                // Extract the package name from the URL
                const packagePath = url.split("npmjs.com/package/")[1];
                if (!packagePath) {
                    throw new Error("Invalid npm URL");
                }
                const apiUrl = `https://registry.npmjs.org/${packagePath}`;
                const response = yield fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`npm API error: ${response.statusText}`);
                }
                const repoURL = yield response.json();
                const repo = repoURL ? repoURL.repository.url : null;
                if (!repo) {
                    yield (0, logger_js_1.info)("No repository URL found in npm data");
                    return JSON.stringify({ mainScore: -1 });
                }
                // Update to Github URL
                url = repo.replace("git+", "").replace(".git", "");
            }
            catch (err) {
                yield (0, logger_js_1.info)("Error fetching npm data");
                throw new Error("Error fetching npm data");
            }
        }
        try {
            data = yield fetchGitHubData(url);
            [openIssues, closedIssues] = yield fetchIssues(url);
        }
        catch (err) {
            yield (0, logger_js_1.info)("Error fetching GitHub data");
            throw new Error("Error fetching GitHub data");
        }
        // structure for getting count (for bus factor) below
        let count; // how many people are contributing to the repo (for bus factor)
        if (data.contributors_count || data.maintainers) {
            // contributors for github and maintainers for npm
            try {
                if (data.contributors_count) {
                    const contributors = yield fetchCollaboratorsCount(data.contributors_count); // have to process the contributors url for GitHub
                    count = contributors.length;
                }
                else {
                    count = data.maintainers;
                }
            }
            catch (err) {
                yield (0, logger_js_1.info)("Error fetching contributors/maintainers");
                throw new Error("Error fetching contributors/maintainers");
            }
        }
        else {
            yield (0, logger_js_1.info)("No contributor or maintainer data available");
            throw new Error("No contributor or maintainer data available");
        }
        // Calculate all metrics in parallel
        const [BusFactor, Correctness, RampUp, ResponsiveMaintainer, License, PinnedDependencies, PRReview] = yield Promise.all([
            measureLatency(() => busFactorScore(count), "BusFactor"), // Bus Factor Score
            measureLatency(() => correctnessScore(data.issues), "Correctness"), // Correctness Score
            measureLatency(() => rampUpScore(url), "RampUp"), // Ramp Up Score
            measureLatency(() => responsivenessScore(openIssues, closedIssues), "ResponsiveMaintainer"), // Responsiveness Score
            measureLatency(() => licenseScore(data), "License"), // License Score
            measureLatency(() => pinnedDependenciesScore(url), "PinnedDependencies"), // Pinned Dependencies Score
            measureLatency(() => pullRequestReviewScore(url), "PRReview"), // Pull Request Review Score
        ]);
        // store weights
        let w_b = 0.2;
        let w_c = 0.25;
        let w_r = 0.15;
        let w_rm = 0.3;
        let w_l = 0.1;
        // calculate score
        let netScore = w_b * BusFactor.score +
            w_c * Correctness.score +
            w_r * RampUp.score +
            w_rm * ResponsiveMaintainer.score +
            w_l * License.score;
        //add in pinned dependencies score
        //add in PR review score
        netScore = parseFloat(netScore.toFixed(2));
        // construct result object, JSONify, then return
        const result = {
            NetScore: netScore,
            RampUp: RampUp.score,
            Correctness: Correctness.score,
            BusFactor: BusFactor.score,
            ResponsiveMaintainer: ResponsiveMaintainer.score,
            License: License.score,
            PinnedDependencies: PinnedDependencies.score,
            PRReview: PRReview.score,
            RampUp_Latency: RampUp.latency,
            Correctness_Latency: Correctness.latency,
            BusFactor_Latency: BusFactor.latency,
            ResponsiveMaintainer_Latency: ResponsiveMaintainer.latency,
            License_Latency: License.latency,
            PinnedDependencies_Latency: PinnedDependencies.latency,
            PRReview_Latency: PRReview.latency,
        };
        yield (0, logger_js_1.info)(`Processed URL: ${url}, Score: ${netScore}`);
        yield (0, logger_js_1.info)(`Result: ${JSON.stringify(result)}`);
        return result;
    });
}
// analyzes bus factor and returns M_b(r) as specified
// in project plan
function busFactorScore(contributorsCount) {
    return __awaiter(this, void 0, void 0, function* () {
        let busFactorScore;
        // each comparison is to a number of contributors that has ranges of safe,moderate, low, and very low
        if (contributorsCount >= 10) {
            busFactorScore = 10;
        }
        else if (contributorsCount >= 5) {
            busFactorScore = 7;
        }
        else if (contributorsCount >= 2) {
            busFactorScore = 4;
        }
        else {
            busFactorScore = 1;
        }
        // return normalized score
        return busFactorScore / 10;
    });
}
// analyzes reliability/quality of codebase
// and returns M_c,normalized(r) as specified in project plan
function correctnessScore(IssueCount) {
    return __awaiter(this, void 0, void 0, function* () {
        if (IssueCount === undefined || IssueCount === null) {
            yield (0, logger_js_1.info)("Issue count is missing, returning correctness score of 0");
            return 0; // No issue count present, return 0
        }
        // If there are 0 issues, return a perfect score of 1
        if (IssueCount === 0) {
            return 1;
        }
        const correctness = 1 / (1 + Math.log(1 + IssueCount));
        return parseFloat(correctness.toFixed(2));
    });
}
//Check if version is pinned
function isPinned(version) {
    //Trim version
    version = version.trim();
    //Pinned patterns
    const pinnedPatterns = [
        /^\d+\.\d+\.\d+$/, // Exact version, e.g., "2.3.4"
        /^\d+\.\d+$/, // Major.Minor, e.g., "2.3"
        /^\d+\.\d+\.(x|\*)$/, // Wildcard patch, e.g., "2.3.x" or "2.3.*"
        /^~\d+\.\d+\.\d+$/, // Tilde operator, e.g., "~2.3.4"
    ];
    //Check if version matches any pinned pattern
    return pinnedPatterns.some(pattern => pattern.test(version));
}
//calculated pinned dependencies score, using pinned dependencies from package.json
function pinnedDependenciesScore(repoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            //Get repo contents and package.json
            const files = yield fetchRepoContents(repoUrl);
            const packageJson = files.find(file => file.name.toLowerCase() === 'package.json');
            //If no package.json, return 0
            if (!packageJson) {
                return 0;
            }
            //Fetch package.json
            const response = yield fetch(packageJson.download_url, {
                headers: {
                    Authorization: `token ${process.env.GITHUB_TOKEN}`,
                },
            });
            //If failed to fetch package.json, throw error
            if (!response.ok) {
                throw new Error(`Failed to fetch package.json: ${response.statusText}`);
            }
            //Parse package.json
            const content = yield response.json();
            //Get dependencies and devDependencies
            const dependencies = content.dependencies || {};
            const devDependencies = content.devDependencies || {};
            const allDependencies = new Set([
                ...Object.keys(dependencies),
                ...Object.keys(devDependencies)
            ]);
            let totalDependencies = allDependencies.size;
            let pinnedDependencies = 0;
            //Check if dependencies are pinned
            for (const dependency of allDependencies) {
                const prodVersion = dependencies[dependency];
                const devVersion = devDependencies[dependency];
                if (prodVersion && devVersion) {
                    // If dependency exists in both, check both versions
                    if (isPinned(prodVersion) && isPinned(devVersion)) {
                        pinnedDependencies++;
                    }
                }
                else {
                    // Check whichever version exists
                    const version = prodVersion || devVersion;
                    if (isPinned(version)) {
                        pinnedDependencies++;
                    }
                }
            }
            //Calculate score which is pinned dependencies / total dependencies and limited between 0 and 1
            const score = pinnedDependencies / totalDependencies;
            //Return score rounded to 2 decimal places
            return parseFloat(score.toFixed(2));
        }
        catch (error) {
            yield (0, logger_js_1.info)(`Error calculating pinned dependencies score: ${error.message}`);
            return 0; //Return 0 if there's an error
        }
    });
}
;
//Calculates PR review score
function pullRequestReviewScore(repoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Extract owner and repo from repoUrl
            const [owner, repo] = repoUrl.split("github.com/")[1].split("/").map(part => part.trim());
            if (!owner || !repo)
                throw new Error("Invalid GitHub repository path");
            // Initialize mergedPRs array and set maxPRs to 100
            const mergedPRs = [];
            const maxPRs = 100; // Reduced limit to 100 PRs
            // Fetch merged PRs up to maxPRs
            const response = yield fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=${maxPRs}`, {
                headers: {
                    Authorization: `token ${process.env.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            //Throw error if failed to fetch PRs
            if (!response.ok)
                throw new Error(`Failed to fetch PRs: ${response.statusText}`);
            //Fetch PRs and add merged PRs to mergedPRs array
            const prs = yield response.json();
            mergedPRs.push(...prs.filter(pr => pr.merged_at !== null).slice(0, maxPRs));
            let prsWithReviews = 0;
            const batchSize = 10; // Process in smaller batches
            //Process PRs in batches
            for (let i = 0; i < mergedPRs.length; i += batchSize) {
                const batch = mergedPRs.slice(i, i + batchSize);
                const reviewPromises = batch.map(pr => fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews`, {
                    headers: {
                        Authorization: `token ${process.env.GITHUB_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                }).then(res => res.json()));
                //Fetch reviews and add to prsWithReviews if reviews are present
                const batchReviews = yield Promise.all(reviewPromises);
                prsWithReviews += batchReviews.filter(reviews => reviews.length > 0).length;
            }
            //Calculate score which is number of PRs with reviews / total number of PRs
            const score = mergedPRs.length > 0 ? prsWithReviews / mergedPRs.length : 0;
            return parseFloat(score.toFixed(2));
        }
        catch (error) {
            yield (0, logger_js_1.info)(`Error in pullRequestReviewScore: ${error.message}`);
            return 0;
        }
    });
}
// analyzes presence and completness of relevant documentation
// for new developers and return M_r(r) as specified in project plan
function rampUpScore(repoUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        let documentationScore = 0;
        let organizationScore = 0;
        let setupScore = 0;
        let testScore = 0;
        let ciCdScore = 0;
        try {
            const files = yield fetchRepoContents(repoUrl); // Changed `any` to `File[]`
            // Here check for the presence of common files and directories, we can expand on this...
            //Check for README.md
            const readmeExists = files.some((file) => file.name.toLowerCase() === "readme.md");
            if (readmeExists) {
                documentationScore += 1;
            }
            // Check for CONTRIBUTING.md
            const contributingExists = files.some((file) => file.name.toLowerCase() === "contributing.md"); // Changed `any` to `File`
            if (contributingExists) {
                documentationScore += 1;
            }
            // Check for src/ and test/ directories
            const srcExists = files.some((file) => file.type === "dir" && file.name.toLowerCase() === "src"); // Changed `any` to `File`
            const testExists = files.some((file) => file.type === "dir" && file.name.toLowerCase() === "test"); // Changed `any` to `File`
            if (srcExists)
                organizationScore += 1;
            if (testExists)
                organizationScore += 1;
            // Check for package.json, requirements.txt, or similar
            const setupFiles = [
                "package.json",
                "requirements.txt",
                "build.gradle",
                "pom.xml",
            ];
            const setupFileExists = files.some((file) => setupFiles.includes(file.name.toLowerCase())); // Changed `any` to `File`
            if (setupFileExists) {
                setupScore += 1;
            }
            // Check for CI/CD config files like .travis.yml, .github/workflows/ci.yml, etc.
            const ciCdFiles = [
                ".travis.yml",
                ".circleci/config.yml",
                ".github/workflows/ci.yml",
            ];
            const ciCdFileExists = files.some((file) => ciCdFiles.includes(file.name.toLowerCase())); // Changed `any` to `File`
            if (ciCdFileExists) {
                ciCdScore += 1;
            }
            // Total score calculation
            const totalScore = documentationScore +
                organizationScore +
                setupScore +
                testScore +
                ciCdScore;
            const maxPossibleScore = 8;
            const normalizedScore = totalScore / maxPossibleScore; // normalize
            return normalizedScore;
        }
        catch (error) {
            yield (0, logger_js_1.info)("Error fetching repository contents for ramp-up score");
            return 0; // Default to 0 if there's an error
        }
    });
}
// Measures issue activity and frequency of closing issues
// and returns M_rm,normalized(r) as specified in project plan
function responsivenessScore(openIssues, closedIssues) {
    return __awaiter(this, void 0, void 0, function* () {
        let numOpenIssues = openIssues.length;
        let numClosedIssues = closedIssues.length;
        let score = numClosedIssues / numOpenIssues > 1 ? 1 : numClosedIssues / numOpenIssues;
        return score ? score : 0;
    });
}
function licenseScore(data) {
    return __awaiter(this, void 0, void 0, function* () {
        // List of licenses that are compatible with LGPL 2.0
        const compatibleLicenses = [
            "GNU General Public License v2.0",
            "GNU General Public License v3.0",
            "GNU Lesser General Public License v2.1",
            "GNU Lesser General Public License v3.0",
            "MIT License",
            "ISC License",
        ];
        // Check if the license exists and if it is compatible with LGPL 2.1
        if (data.license && compatibleLicenses.includes(data.license)) {
            return 1; // License is present and compatible
        }
        return 0; // No compatible license found
    });
}
// Define a function to fetch data from the GitHub API
function fetchGitHubData(url) {
    return __awaiter(this, void 0, void 0, function* () {
        // Extract the repository owner and name from the URL
        const repoPath = url.split("github.com/")[1];
        if (!repoPath) {
            throw new Error("Invalid GitHub URL");
        }
        // Ensure the repository path is in the format 'owner/repo'
        const [owner, repo] = repoPath.split("/").map((part) => part.trim());
        if (!owner || !repo) {
            throw new Error("Invalid GitHub repository path");
        }
        // Get the GitHub token from the environment
        const githubToken = process.env.GITHUB_TOKEN;
        if (!githubToken) {
            throw new Error("GITHUB_TOKEN is not set in the environment");
        }
        // Construct the GitHub API URL
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const response = yield fetch(apiUrl, {
            headers: {
                Authorization: `token ${githubToken}`,
            },
        });
        // Check if the response is OK (status code 200-299)
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        // Parse the JSON response
        const data = yield response.json();
        // Extract relevant information if needed
        const result = {
            stars: data.stargazers_count,
            forks: data.forks_count,
            issues: data.open_issues_count,
            license: data.license ? data.license.name : "No license",
            updated_at: data.updated_at,
            contributors_count: data.contributors_url,
        };
        return result;
    });
}
// Define function to get issues data from GitHub URL (last 3 months)
function fetchIssues(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        now.setMonth(now.getMonth() - 3); // Subtract three months
        const lastMonthDate = now.toISOString();
        // Build query URLs
        const repoPath = url.split("github.com/")[1];
        if (!repoPath) {
            throw new Error("Invalid GitHub URL");
        }
        // Ensure the repository path is in the format 'owner/repo'
        const [owner, repo] = repoPath.split("/").map((part) => part.trim());
        if (!owner || !repo) {
            throw new Error("Invalid GitHub repository path");
        }
        // Construct the GitHub API URLs for opened and close and still open issues
        const openIssuesURL = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&since=${lastMonthDate}`;
        const closedIssuesURL = `https://api.github.com/repos/${owner}/${repo}/issues?state=closed&since=${lastMonthDate}`;
        const openResponse = yield fetch(openIssuesURL, {
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
            },
        });
        const closedResponse = yield fetch(closedIssuesURL, {
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
            },
        });
        const openIssues = yield openResponse.json();
        const closedIssues = yield closedResponse.json();
        return [openIssues, closedIssues];
    });
}
// function for getting the number of contributors from a GitHub repo
function fetchCollaboratorsCount(url) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!url || !url.startsWith("https://api.github.com/repos/")) {
            throw new Error("Invalid contributors count URL");
        }
        const response = yield fetch(url, {
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const contributors = yield response.json();
        return contributors;
    });
}
// Fetch repo contents
function fetchRepoContents(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const repoPath = url.split("github.com/")[1];
        if (!repoPath)
            throw new Error("Invalid GitHub URL");
        const [owner, repo] = repoPath.split("/");
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
        const response = yield fetch(apiUrl, {
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const files = yield response.json();
        return files;
    });
}
//# sourceMappingURL=metric_score.js.map