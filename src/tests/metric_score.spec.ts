import * as metricScore from '../metric_score.js';
import fetch, { Response } from 'node-fetch';

global.fetch = fetch; // Set global fetch for tests

describe('pinnedDependenciesScore', () => {
  // Store the original function to restore later
  const originalFetchRepoContents = metricScore.fetchRepoContents;

  afterEach(() => {
    // Restore the original function after each test
    (metricScore as any).fetchRepoContents = originalFetchRepoContents;
    global.fetch = fetch;
  });

  it('should return a score of 0 if no package.json exists', async () => {
    // Use type assertion to bypass readonly restriction
    (metricScore as any).fetchRepoContents = async () => [];
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo');
    expect(score).toBe(0); // No package.json should return 0
  });

  it('should correctly calculate the pinned dependencies score', async () => {
    // Use type assertion to bypass readonly restriction
    (metricScore as any).fetchRepoContents = async () => [
      {
        name: "package.json",
        path: "package.json",
        sha: "123",
        size: 1234,
        url: "mock-url",
        html_url: "mock-html-url",
        git_url: "mock-git-url",
        download_url: "mock-url/package.json",
        type: "file",
        _links: {
          self: "mock-self",
          git: "mock-git",
          html: "mock-html",
        },
      },
    ];

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          dependencies: { react: "17.0.2", lodash: "^4.17.21" },
          devDependencies: { jest: "26.6.3", typescript: "~4.1.3" },
        })
      );

    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo');
    expect(score).toBe(0.5); // 2 out of 4 dependencies are pinned
  });

  it('should return 0 if fetching package.json fails', async () => {
    // Use type assertion to bypass readonly restriction
    (metricScore as any).fetchRepoContents = async () => [
      {
        name: "package.json",
        path: "package.json",
        sha: "123",
        size: 1234,
        url: "mock-url",
        html_url: "mock-html-url",
        git_url: "mock-git-url",
        download_url: "mock-url/package.json",
        type: "file",
        _links: {
          self: "mock-self",
          git: "mock-git",
          html: "mock-html",
        },
      },
    ];

    global.fetch = async () => new Response(null, { status: 404, statusText: "Not Found" });

    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo');
    expect(score).toBe(0);
  });

  it('should handle empty dependencies gracefully', async () => {
    // Use type assertion to bypass readonly restriction
    (metricScore as any).fetchRepoContents = async () => [
      {
        name: "package.json",
        path: "package.json",
        sha: "123",
        size: 1234,
        url: "mock-url",
        html_url: "mock-html-url",
        git_url: "mock-git-url",
        download_url: "mock-url/package.json",
        type: "file",
        _links: {
          self: "mock-self",
          git: "mock-git",
          html: "mock-html",
        },
      },
    ];

    global.fetch = async () =>
      new Response(JSON.stringify({ dependencies: {}, devDependencies: {} }));

    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo');
    expect(score).toBe(1.0);
  });
});