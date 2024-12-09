import { pullRequestReviewScore } from '../metric_score.js';

console.log('pull_request_review_score.spec.ts loaded');

describe('pullRequestReviewScore', () => {
  let mockFetch: jasmine.Spy;

  beforeEach(() => {
    console.log('Setting up mock fetch');
    mockFetch = jasmine.createSpy();
    global.fetch = mockFetch;
    console.log('Mock fetch set up successfully');
  });

  /** General Functionality Tests **/
  describe('General Functionality', () => {
    it('should return 0 if the repository has no merged PRs', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });

    it('should return 0 if no PRs have reviews', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [
              { number: 1, merged_at: '2024-01-01T00:00:00Z' },
              { number: 2, merged_at: '2024-01-02T00:00:00Z' },
            ],
          });
        } else if (url.includes('/reviews')) {
          return Promise.resolve({
            ok: true,
            json: () => [],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });

    it('should calculate the correct score for reviewed and non-reviewed PRs', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [
              { number: 1, merged_at: '2024-01-01T00:00:00Z' },
              { number: 2, merged_at: '2024-01-02T00:00:00Z' },
            ],
          });
        } else if (url.includes('/1/reviews')) {
          return Promise.resolve({
            ok: true,
            json: () => [{ id: 1 }],
          });
        } else if (url.includes('/2/reviews')) {
          return Promise.resolve({
            ok: true,
            json: () => [],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0.5);
    });
  });

  /** Edge Case Tests **/
  describe('Edge Cases', () => {
    it('should handle invalid GitHub URLs gracefully', async () => {
      const score = await pullRequestReviewScore('https://invalid.url');
      expect(score).toBe(0);
    });

    it('should handle GitHub API errors gracefully', async () => {
      mockFetch.and.resolveTo({
        ok: false,
        statusText: 'Not Found',
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });

    it('should handle repositories with permission errors gracefully', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Forbidden',
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });

    it('should correctly handle repositories with merged PRs but inaccessible review data', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [
              { number: 1, merged_at: '2024-01-01T00:00:00Z' },
              { number: 2, merged_at: '2024-01-02T00:00:00Z' },
            ],
          });
        } else if (url.includes('/reviews')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Forbidden',
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });

    it('should handle repositories with a large number of PRs efficiently', async () => {
      const prBatch = Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        merged_at: '2024-01-01T00:00:00Z',
      }));

      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => prBatch,
          });
        } else if (url.includes('/reviews')) {
          return Promise.resolve({
            ok: true,
            json: () => [{ id: 1 }],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(1.0);
    });
  });

  /** Comprehensive Tests **/
  describe('Comprehensive Tests', () => {
    it('should return 1.0 when all PRs have reviews', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [
              { number: 1, merged_at: '2024-01-01T00:00:00Z' },
              { number: 2, merged_at: '2024-01-02T00:00:00Z' },
            ],
          });
        } else if (url.includes('/reviews')) {
          return Promise.resolve({
            ok: true,
            json: () => [{ id: 1 }, { id: 2 }],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(1.0);
    });

    it('should return 0 when no merged PRs exist', async () => {
      mockFetch.and.callFake(url => {
        if (url.includes('/pulls')) {
          return Promise.resolve({
            ok: true,
            json: () => [],
          });
        }
      });

      const score = await pullRequestReviewScore('https://github.com/test/repo');
      expect(score).toBe(0);
    });
  });
  describe('pullRequestReviewScore Advanced Test Suite', () => {
    let mockFetch: jasmine.Spy;
  
    beforeEach(() => {
      mockFetch = jasmine.createSpy();
      global.fetch = mockFetch;
    });
  
    /** Repository URL Handling **/
    describe('Repository URL Handling', () => {
      it('should handle repository URLs with uppercase characters', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [{ id: 1 }],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/OWNER/REPO');
        expect(score).toBe(1.0);
      });
  
      it('should handle repository URLs with trailing slashes', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [{ id: 1 }],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/owner/repo/');
        expect(score).toBe(1.0);
      });
    });
  
    /** PR Review Complexity Scenarios **/
    describe('PR Review Complexity', () => {
      it('should handle PRs with multiple reviews per PR', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' },
                { number: 2, merged_at: '2024-01-02T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { id: 1 },
                { id: 2 },
                { id: 3 }
              ],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(1.0);
      });
  
      it('should handle PRs with only one review type', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' },
                { number: 2, merged_at: '2024-01-02T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { id: 1, state: 'APPROVED' },
                { id: 2, state: 'APPROVED' }
              ],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(1.0);
      });
    });
  
    /** Pagination and Large Dataset Handling **/
    describe('Pagination and Large Datasets', () => {
      it('should handle repositories with exactly 100 merged PRs', async () => {
        const prBatch = Array.from({ length: 100 }, (_, i) => ({
          number: i + 1,
          merged_at: '2024-01-01T00:00:00Z',
        }));
  
        const reviewBatches = prBatch.map(() => [{ id: 1 }]);
  
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => prBatch,
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [{ id: 1 }],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(1.0);
      });
  
      it('should handle repositories with more than 100 merged PRs', async () => {
        const prBatch = Array.from({ length: 150 }, (_, i) => ({
          number: i + 1,
          merged_at: '2024-01-01T00:00:00Z',
        }));
  
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => prBatch.slice(0, 100),
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [{ id: 1 }],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(1.0);
      });
    });
  
    /** Error and Edge Case Handling **/
    describe('Advanced Error and Edge Cases', () => {
      it('should handle network timeout during PR fetch', async () => {
        mockFetch.and.returnValue(new Promise(() => {})); // Simulate timeout
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0);
      });
  
      it('should handle malformed PR data', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { invalidKey: 'unexpected data' }
              ],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0);
      });
  
      it('should handle very old PRs with no reviews', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2010-01-01T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => [],
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0);
      });
  
      it('should handle rate limit errors gracefully', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: false,
              status: 403,
              statusText: 'Rate Limit Exceeded',
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0);
      });
    });
  
    /** Partial Review Scenarios **/
    describe('Partial Review Scenarios', () => {
      it('should handle mixed review statuses', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' },
                { number: 2, merged_at: '2024-01-02T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => {
                // Simulate first PR with review, second without
                if (url.includes('/1/')) {
                  return [{ id: 1 }];
                }
                return [];
              },
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0.5);
      });
  
      it('should handle PRs with different review states', async () => {
        mockFetch.and.callFake(url => {
          if (url.includes('/pulls')) {
            return Promise.resolve({
              ok: true,
              json: () => [
                { number: 1, merged_at: '2024-01-01T00:00:00Z' },
                { number: 2, merged_at: '2024-01-02T00:00:00Z' }
              ],
            });
          } else if (url.includes('/reviews')) {
            return Promise.resolve({
              ok: true,
              json: () => {
                if (url.includes('/1/')) {
                  return [
                    { id: 1, state: 'APPROVED' },
                    { id: 2, state: 'COMMENTED' }
                  ];
                }
                return [];
              },
            });
          }
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0.5);
      });
    });
  
    /** Authorization and Token Scenarios **/
    describe('Authorization and Token Scenarios', () => {
      it('should handle missing GitHub token', async () => {
        // Temporarily remove GitHub token
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;
  
        try {
          const score = await pullRequestReviewScore('https://github.com/test/repo');
          expect(score).toBe(0);
        } finally {
          // Restore the original token
          if (originalToken) {
            process.env.GITHUB_TOKEN = originalToken;
          }
        }
      });
  
      it('should handle invalid GitHub token', async () => {
        mockFetch.and.callFake(() => {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
          });
        });
  
        const score = await pullRequestReviewScore('https://github.com/test/repo');
        expect(score).toBe(0);
      });
    });
});
});
