import * as metricScore from '../metric_score.js';

console.log('metric_score.spec.ts loaded');

describe('pinnedDependenciesScore', () => {
  let mockFetchRepoContents: jasmine.Spy;

  beforeEach(() => {
    console.log('Setting up mock fetchRepoContents');
    mockFetchRepoContents = jasmine.createSpy();
    console.log('Mock fetchRepoContents set up successfully');
  });

  /** General Functionality Tests **/
  describe('General Functionality', () => {
    it('should return a score of 1.00 if no package.json exists', async () => {
      mockFetchRepoContents.and.resolveTo([]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 1.00 if dependencies and devDependencies are empty', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: {}, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 1.00 if all dependencies are pinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '17.0.2', lodash: '4.17.21' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 0.00 if all dependencies are unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '^17.0.2', lodash: '~4.17.21' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should calculate the correct score for mixed pinned and unpinned dependencies', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            dependencies: { react: '17.0.2', lodash: '^4.17.21' },
            devDependencies: { jest: '26.6.3', typescript: '~4.1.3' },
          })
        );
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.5); // 2 pinned out of 4 total
    });

    it('should calculate correctly when only dependencies exist', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: '17.0.2' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should calculate correctly when only devDependencies exist', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: {}, devDependencies: { jest: '26.6.3' } }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should handle dependencies with version ranges as unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '>=16.0.0' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should handle wildcard versions as unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: '1.x' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should handle invalid or malformed versions gracefully', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: 'invalid' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });
  });

  /** Edge Case Tests **/
  describe('Edge Cases', () => {
    it('should return 1.00 if dependencies field is null', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: null, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    //it('should return 1.00 if devDependencies field is null', async () => {
    //  mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    //  global.fetch = async () => new Response(JSON.stringify({ dependencies: {}, devDependencies: null }));
   //   const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    //  expect(score).toBe(1.0);
    //});

    it('should handle missing package.json gracefully', async () => {
      mockFetchRepoContents.and.resolveTo([]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should handle repositories with invalid download URLs for package.json', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'invalid-url' }]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should return 0.00 if fetching package.json throws an error', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => {
        throw new Error('Network error');
      };
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should correctly calculate score with a mix of valid and invalid versions', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            dependencies: { react: '17.0.2', lodash: 'invalid', jest: '^26.6.3' },
            devDependencies: { typescript: '4.1.3' },
          })
        );
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.5); // 2 pinned out of 4 total
    });
  });



describe('pinnedDependenciesScore', () => {
  let mockFetchRepoContents: jasmine.Spy;

  beforeEach(() => {
    console.log('Setting up mock fetchRepoContents');
    mockFetchRepoContents = jasmine.createSpy();
    console.log('Mock fetchRepoContents set up successfully');
  });

  /** General Functionality Tests **/
  describe('General Functionality', () => {
    it('should return a score of 1.00 if no package.json exists', async () => {
      mockFetchRepoContents.and.resolveTo([]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 1.00 if dependencies and devDependencies are empty', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: {}, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 1.00 if all dependencies are pinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '17.0.2', lodash: '4.17.21' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return a score of 0.00 if all dependencies are unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '^17.0.2', lodash: '~4.17.21' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should calculate the correct score for mixed pinned and unpinned dependencies', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            dependencies: { react: '17.0.2', lodash: '^4.17.21' },
            devDependencies: { jest: '26.6.3', typescript: '~4.1.3' },
          })
        );
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.5); // 2 pinned out of 4 total
    });

    it('should calculate correctly when only dependencies exist', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: '17.0.2' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should calculate correctly when only devDependencies exist', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: {}, devDependencies: { jest: '26.6.3' } }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should handle dependencies with version ranges as unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(JSON.stringify({ dependencies: { react: '>=16.0.0' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should handle wildcard versions as unpinned', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: '1.x' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should handle invalid or malformed versions gracefully', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: { react: 'invalid' }, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });
  });

  /** Edge Case Tests **/
  describe('Edge Cases', () => {
    it('should return 1.00 if dependencies field is null', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: null, devDependencies: {} }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should return 1.00 if devDependencies field is null', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => new Response(JSON.stringify({ dependencies: {}, devDependencies: null }));
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should handle missing package.json gracefully', async () => {
      mockFetchRepoContents.and.resolveTo([]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(1.0);
    });

    it('should handle repositories with invalid download URLs for package.json', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'invalid-url' }]);
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should return 0.00 if fetching package.json throws an error', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () => {
        throw new Error('Network error');
      };
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.0);
    });

    it('should correctly calculate score with a mix of valid and invalid versions', async () => {
      mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            dependencies: { react: '17.0.2', lodash: 'invalid', jest: '^26.6.3' },
            devDependencies: { typescript: '4.1.3' },
          })
        );
      const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
      expect(score).toBe(0.5); // 2 pinned out of 4 total
    });
  });

  it('should handle nested dependencies (not directly supported)', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(JSON.stringify({ dependencies: { "react": "17.0.2", "nested-dependency": { "lodash": "4.17.21" } } }));
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(1.0); // Only direct dependencies are scored
  });
  it('should handle unreachable dependency download URLs', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () => new Response(null, { status: 404 });
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.0);
  });

  it('should handle files with missing download_url gracefully', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json' }]);
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.0); // No valid download_url
  });
  
  it('should correctly calculate score for repositories with many dependencies', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          dependencies: { dep1: '1.0.0', dep2: '^1.2.3', dep3: '~2.3.4', dep4: '3.0.0' },
          devDependencies: { dev1: '^4.5.6', dev2: '5.0.0' },
        })
      );
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.5); // 3 pinned out of 6 total
  });

  it('should handle empty repository with no files', async () => {
    mockFetchRepoContents.and.resolveTo([]);
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(1.0); // No dependencies, so default is 1.0
  });

  it('should handle duplicate dependencies across dependencies and devDependencies', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          dependencies: { react: '17.0.2', lodash: '4.17.21' },
          devDependencies: { lodash: '4.17.21', jest: '^26.6.3' },
        })
      );
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.75); // 3 pinned out of 4 unique dependencies
  });

  it('should ignore metadata fields in dependencies', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          dependencies: { react: '17.0.2', lodash: '4.17.21' },
          devDependencies: { jest: '26.6.3', meta: { version: '1.0.0' } },
        })
      );
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(1.0);
  });

  it('should handle repositories without JavaScript dependencies', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'README.md', download_url: 'mock-url' }]);
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(1.0); // No dependencies, so default is 1.0
  });

  
  it('should handle repositories with a large number of dependencies', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    const dependencies = {};
    for (let i = 0; i < 1000; i++) {
      dependencies[`dep${i}`] = i % 2 === 0 ? '1.0.0' : '^1.0.0';
    }
    global.fetch = async () => new Response(JSON.stringify({ dependencies, devDependencies: {} }));
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.5); // Half pinned, half unpinned
  });

  it('should handle invalid JSON in package.json gracefully', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () => new Response('Invalid JSON');
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.0);
  });

  it('should handle repositories with multiple package.json files', async () => {
    mockFetchRepoContents.and.resolveTo([
      { name: 'package.json', download_url: 'mock-url-1' },
      { name: 'package.json', download_url: 'mock-url-2' },
    ]);
    global.fetch = async (url) =>
      new Response(
        JSON.stringify(
          url.endsWith('mock-url-1')
            ? { dependencies: { dep1: '1.0.0' } }
            : { dependencies: { dep2: '^2.0.0' } }
        )
      );
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.5); // Mix of pinned and unpinned dependencies
  });

  it('should handle mixed-case dependency names consistently', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          dependencies: { React: '17.0.2', lodash: '^4.17.21' },
        })
      );
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.5);
  });

  it('should handle empty JSON content in package.json', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () => new Response('{}');
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(1.0); // No dependencies, so default is 1.0
  });

  it('should handle repositories with permission errors gracefully', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () => new Response(null, { status: 403 });
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
    expect(score).toBe(0.0);
  });

  it('should handle scoped npm packages', async () => {
    mockFetchRepoContents.and.resolveTo([{ name: 'package.json', download_url: 'mock-url' }]);
    global.fetch = async () =>
      new Response(JSON.stringify({ dependencies: { '@scope/package': '1.0.0' }, devDependencies: {} }));
    const score = await metricScore.pinnedDependenciesScore('https://github.com/test/repo', mockFetchRepoContents);
  


    });
  });
  });
