//Declare file interface
interface File {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: "file" | "dir";
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

// Function to calculate score and latency for each metric
const measureLatency = async (fn: () => Promise<any>, label: string) => {
  const start = Date.now();
  const score = await fn();
  const latency = Date.now() - start;
  return { score, latency, label };
};

// takes as input URL and returns a score
export async function netScore(url: string): Promise<any> {
  const start = Date.now();
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
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`npm API error: ${response.statusText}`);
      }
      const repoURL = await response.json();

      const repo: string = repoURL ? repoURL.repository.url : null;

      if (!repo) {
        console.info("No repository URL found in npm data");
        return JSON.stringify({ mainScore: -1 });
      }

      // Update to Github URL
      url = repo.replace("git+", "").replace(".git", "");
    } catch (err) {
      console.info("Error fetching npm data");
      throw new Error("Error fetching npm data");
    }
  }

  try {
    data = await fetchGitHubData(url);
    [openIssues, closedIssues] = await fetchIssues(url);
  } catch (err) {
    console.info("Error fetching GitHub data");
    throw new Error(`Error fetching GitHub data: ${err.message}`);
  }

  // structure for getting count (for bus factor) below
  let count; // how many people are contributing to the repo (for bus factor)
  if (data.contributors_count || data.maintainers) {
    // contributors for github and maintainers for npm
    try {
      if (data.contributors_count) {
        const contributors = await fetchCollaboratorsCount(
          data.contributors_count
        ); // have to process the contributors url for GitHub
        count = contributors.length;
      } else {
        count = data.maintainers;
      }
    } catch (err) {
      console.info("Error fetching contributors/maintainers");
      throw new Error("Error fetching contributors/maintainers");
    }
  } else {
    console.info("No contributor or maintainer data available");
    throw new Error("No contributor or maintainer data available");
  }

  // Calculate all metrics in parallel
  const [BusFactor, Correctness, RampUp, ResponsiveMaintainer, License, PinnedDependencies, PRReview] =
    await Promise.all([
      measureLatency(() => busFactorScore(count), "BusFactor"), // Bus Factor Score
      measureLatency(() => correctnessScore(data.issues), "Correctness"), // Correctness Score
      measureLatency(() => rampUpScore(url), "RampUp"), // Ramp Up Score
      measureLatency(
        () => responsivenessScore(openIssues, closedIssues),
        "ResponsiveMaintainer"
      ), // Responsiveness Score
      measureLatency(() => licenseScore(data), "License"), // License Score
      measureLatency(() => pinnedDependenciesScore(url), "PinnedDependencies"), // Pinned Dependencies Score
      measureLatency(() => pullRequestReviewScore(url), "PRReview"), // Pull Request Review Score
    ]);

  // store weights
  let w_b: number = 0.1;
  let w_c: number = 0.25;
  let w_r: number = 0.15;
  let w_rm: number = 0.3;
  let w_l: number = 0.1;
  let w_pd: number = 0.05;
  let w_pr: number = 0.05;

  // calculate score
  let netScore: number =
    w_b * BusFactor.score +
    w_c * Correctness.score +
    w_r * RampUp.score +
    w_rm * ResponsiveMaintainer.score +
    w_l * License.score +
    w_pd * PinnedDependencies.score +
    w_pr * PRReview.score;
  
  netScore = parseFloat(netScore.toFixed(2));

  const netScoreLatency = Date.now() - start;
  // construct result object, JSONify, then return
  const result = {
    NetScore: netScore,
    RampUp: RampUp.score,
    Correctness: Correctness.score,
    BusFactor: BusFactor.score,
    ResponsiveMaintainer: ResponsiveMaintainer.score,
    LicenseScore: License.score,
    GoodPinningPractice: PinnedDependencies.score,
    PullRequest: PRReview.score,
    RampUpLatency: RampUp.latency,
    CorrectnessLatency: Correctness.latency,
    BusFactorLatency: BusFactor.latency,
    ResponsiveMaintainerLatency: ResponsiveMaintainer.latency,
    LicenseScoreLatency: License.latency,
    GoodPinningPracticeLatency: PinnedDependencies.latency,
    PullRequestLatency: PRReview.latency,
    NetScoreLatency: netScoreLatency,
  };

  console.info(`Processed URL: ${url}, Score: ${netScore}`);
  console.info(`Result: ${JSON.stringify(result)}`);
  return result;
}

// analyzes bus factor and returns M_b(r) as specified
// in project plan
export async function busFactorScore(
  contributorsCount: number
): Promise<number> {
  let busFactorScore;

  // each comparison is to a number of contributors that has ranges of safe,moderate, low, and very low
  if (contributorsCount >= 10) {
    busFactorScore = 10;
  } else if (contributorsCount >= 5) {
    busFactorScore = 7;
  } else if (contributorsCount >= 2) {
    busFactorScore = 4;
  } else {
    busFactorScore = 1;
  }

  // return normalized score
  return busFactorScore / 10;
}

// analyzes reliability/quality of codebase
// and returns M_c,normalized(r) as specified in project plan
export async function correctnessScore(IssueCount: number): Promise<number> {
  if (IssueCount === undefined || IssueCount === null) {
    console.info("Issue count is missing, returning correctness score of 0");
    return 0; // No issue count present, return 0
  }

  // If there are 0 issues, return a perfect score of 1
  if (IssueCount === 0) {
    return 1;
  }

  const correctness = 1 / (1 + Math.log(1 + IssueCount));

  return parseFloat(correctness.toFixed(2));
}

//Check if version is pinned
function isPinned(version: string): boolean {
  //Trim version
  version = version.trim();

  //Pinned patterns
  const pinnedPatterns = [
    /^\d+\.\d+\.\d+$/,       // Exact version, e.g., "2.3.4"
    /^\d+\.\d+$/,            // Major.Minor, e.g., "2.3"
    /^\d+\.\d+\.(x|\*)$/,    // Wildcard patch, e.g., "2.3.x" or "2.3.*"
    /^~\d+\.\d+\.\d+$/,      // Tilde operator, e.g., "~2.3.4"
  ];

  //Check if version matches any pinned pattern
  return pinnedPatterns.some(pattern => pattern.test(version));
}

//calculated pinned dependencies score, using pinned dependencies from package.json
export async function pinnedDependenciesScore(repoUrl: string): Promise<number> {
  try {
    //Get repo contents and package.json
    const files: File[] = await fetchRepoContents(repoUrl);
    const packageJson = files.find(file => file.name.toLowerCase() === 'package.json');

    //If no package.json, return 1
    if (!packageJson) {
      return parseFloat((1.00).toFixed(2));
    }

    //Fetch package.json
    const response = await fetch(packageJson.download_url, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
      },
    });

    //If failed to fetch package.json, throw error
    if (!response.ok) {
      throw new Error(`Failed to fetch package.json: ${response.statusText}`);
    }

    //Parse package.json
    const content = await response.json();

    //Get dependencies and devDependencies
    const dependencies = content.dependencies || {};
    const devDependencies = content.devDependencies || {};
    const allDependencies = new Set([
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies)
    ]);

    let totalDependencies = allDependencies.size;

    if (totalDependencies === 0) {
      return parseFloat((1.00).toFixed(2));
    }

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
      } else {
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
    console.info(`Error calculating pinned dependencies score: ${error.message}`);
    return 0; //Return 0 if there's an error
  }
};

//Calculates PR review score
export async function pullRequestReviewScore(repoUrl: string): Promise<number> {
  try {
    // Extract owner and repo from repoUrl
    const [owner, repo] = repoUrl.split("github.com/")[1].split("/").map(part => part.trim());
    if (!owner || !repo) throw new Error("Invalid GitHub repository path");

    // Initialize mergedPRs array and set maxPRs to 100
    const mergedPRs: any[] = [];
    const maxPRs = 100; // Reduced limit to 100 PRs

    // Fetch merged PRs up to maxPRs
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=${maxPRs}`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    //Throw error if failed to fetch PRs
    if (!response.ok) throw new Error(`Failed to fetch PRs: ${response.statusText}`);

    //Fetch PRs and add merged PRs to mergedPRs array
    const prs = await response.json();
    mergedPRs.push(...prs.filter(pr => pr.merged_at !== null).slice(0, maxPRs));

    let prsWithReviews = 0;
    const batchSize = 10; // Process in smaller batches

    //Process PRs in batches
    for (let i = 0; i < mergedPRs.length; i += batchSize) {
      const batch = mergedPRs.slice(i, i + batchSize);
      const reviewPromises = batch.map(pr =>
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews`, {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }).then(res => res.json())
      );

      //Fetch reviews and add to prsWithReviews if reviews are present
      const batchReviews = await Promise.all(reviewPromises);
      prsWithReviews += batchReviews.filter(reviews => reviews.length > 0).length;
    }

    //Calculate score which is number of PRs with reviews / total number of PRs
    const score = mergedPRs.length > 0 ? prsWithReviews / mergedPRs.length : 0;
    return parseFloat(score.toFixed(2));
  } catch (error) {
    console.info(`Error in pullRequestReviewScore: ${error.message}`);
    return 0;
  }
}

// analyzes presence and completness of relevant documentation
// for new developers and return M_r(r) as specified in project plan
export async function rampUpScore(repoUrl: string): Promise<number> {
  let documentationScore = 0;
  let organizationScore = 0;
  let setupScore = 0;
  let testScore = 0;
  let ciCdScore = 0;

  try {
    const files: File[] = await fetchRepoContents(repoUrl); // Changed `any` to `File[]`

    // Here check for the presence of common files and directories, we can expand on this...
    
    //Check for README.md
    const readmeExists = files.some(
      (file: File) => file.name.toLowerCase() === "readme.md"
    ); 
    if (readmeExists) {
      documentationScore += 1;
    }

    // Check for CONTRIBUTING.md
    const contributingExists = files.some(
      (file: File) => file.name.toLowerCase() === "contributing.md"
    ); // Changed `any` to `File`
    if (contributingExists) {
      documentationScore += 1;
    }

    // Check for src/ and test/ directories
    const srcExists = files.some(
      (file: File) => file.type === "dir" && file.name.toLowerCase() === "src"
    ); // Changed `any` to `File`
    const testExists = files.some(
      (file: File) => file.type === "dir" && file.name.toLowerCase() === "test"
    ); // Changed `any` to `File`
    if (srcExists) organizationScore += 1;
    if (testExists) organizationScore += 1;

    // Check for package.json, requirements.txt, or similar
    const setupFiles = [
      "package.json",
      "requirements.txt",
      "build.gradle",
      "pom.xml",
    ];
    const setupFileExists = files.some((file: File) =>
      setupFiles.includes(file.name.toLowerCase())
    ); // Changed `any` to `File`
    if (setupFileExists) {
      setupScore += 1;
    }

    // Check for CI/CD config files like .travis.yml, .github/workflows/ci.yml, etc.
    const ciCdFiles = [
      ".travis.yml",
      ".circleci/config.yml",
      ".github/workflows/ci.yml",
    ];
    const ciCdFileExists = files.some((file: File) =>
      ciCdFiles.includes(file.name.toLowerCase())
    ); // Changed `any` to `File`
    if (ciCdFileExists) {
      ciCdScore += 1;
    }

    // Total score calculation
    const totalScore =
      documentationScore +
      organizationScore +
      setupScore +
      testScore +
      ciCdScore;
    const maxPossibleScore = 8;
    const normalizedScore = totalScore / maxPossibleScore; // normalize

    return normalizedScore;
  } catch (error) {
    console.info("Error fetching repository contents for ramp-up score");
    return 0; // Default to 0 if there's an error
  }
}

// Measures issue activity and frequency of closing issues
// and returns M_rm,normalized(r) as specified in project plan
export async function responsivenessScore(
  openIssues,
  closedIssues
): Promise<number> {
  let numOpenIssues = openIssues.length;
  let numClosedIssues = closedIssues.length;

  let score =
    numClosedIssues / numOpenIssues > 1 ? 1 : numClosedIssues / numOpenIssues;
  return score ? score : 0;
}

export async function licenseScore(data: any): Promise<number> {
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
}

// Define a function to fetch data from the GitHub API
export async function fetchGitHubData(url: string) {
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

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${githubToken}`,
    },
  });
  
  // Check if the response is OK (status code 200-299)
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  // Parse the JSON response
  const data = await response.json();
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
}

// Define function to get issues data from GitHub URL (last 3 months)
export async function fetchIssues(url: string) {
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

  const openResponse = await fetch(openIssuesURL, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });
  const closedResponse = await fetch(closedIssuesURL, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });

  const openIssues = await openResponse.json();
  const closedIssues = await closedResponse.json();

  return [openIssues, closedIssues];
}

// function for getting the number of contributors from a GitHub repo
export async function fetchCollaboratorsCount(url: string): Promise<any[]> {
  if (!url || !url.startsWith("https://api.github.com/repos/")) {
    throw new Error("Invalid contributors count URL");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  const contributors = await response.json();
  return contributors;
}

// Fetch repo contents
export async function fetchRepoContents(url: string): Promise<File[]> {
  const repoPath = url.split("github.com/")[1];
  if (!repoPath) throw new Error("Invalid GitHub URL");

  const [owner, repo] = repoPath.split("/");
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  
  const files: File[] = await response.json();
  return files;
}

