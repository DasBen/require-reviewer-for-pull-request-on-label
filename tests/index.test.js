const core = require('@actions/core');
const index = require('../index');
const { getOctokit, context } = require('@actions/github');
const nock = require('nock');

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: {
    repo: { owner: 'owner', repo: 'repo' },
    payload: { pull_request: { number: 1 } },
  },
}));

function mockCoreInputs(inputs) {
  core.getInput = jest.fn((name) => {
    if (name in inputs) {
      return inputs[name];
    }
    return 'test-input';
  });
}

function mockOctokitClient(octokitMocks) {
  getOctokit.mockReturnValue({
    rest: octokitMocks,
  });
}

describe('run function', () => {
  afterEach(() => {
    jest.resetAllMocks();
    nock.cleanAll();
  });

  describe('missing inputs', () => {
    const scenarios = [
      {
        id: 'github-token',
        'github-token': '',
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'label1,label2',
        error: 'GitHub token not provided',
      },
      {
        id: 'required-reviewers',
        'github-token': 'test-token',
        'required-reviewers': '',
        'required-labels': 'label1,label2',
        error: 'Required reviewers not provided',
      },
      {
        id: 'required-labels',
        'github-token': 'test-token',
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': '',
        error: 'Required labels not provided',
      },
    ];

    scenarios.forEach((scenario) => {
      test(`Should do nothing if there are missing inputs for ${scenario.id} `, async () => {
        // Mock core inputs
        mockCoreInputs(scenario);

        // Mock Octokit client with empty values for the expected properties
        mockOctokitClient({});

        // Mock core.setFailed
        core.setFailed = jest.fn();

        // Run the function
        await index.run();

        // Assertions
        expect(core.setFailed).toHaveBeenCalledWith(scenario.error);
      });
    });
  });

  describe('reviewer checks', () => {
    it('should check for required reviewers and create a comment if none found', async () => {
      // Mock core inputs
      mockCoreInputs({
        'github-token': 'test-token',
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'requiredLabel',
      });

      // Mock Octokit client
      mockOctokitClient({
        pulls: {
          get: jest.fn().mockReturnValue(
            Promise.resolve({
              data: {
                labels: [{ name: 'requiredLabel' }], // Required label is present
                requested_reviewers: [], // No reviewers
              },
            })
          ),
        },
        issues: {
          listComments: jest
            .fn()
            .mockReturnValue(Promise.resolve({ data: [] })),
          createComment: jest.fn().mockReturnValue(Promise.resolve({})),
          updateComment: jest.fn(),
          deleteComment: jest.fn(),
        },
      });

      // Mock core.setFailed
      core.setFailed = jest.fn();

      // Run the function
      await index.run();

      // Assertions
      expect(core.setFailed).toHaveBeenCalledWith('Reviewers check failed.');
    });

    it('should handle the case when pull request already has required reviewer(s)', async () => {
      // Mock core inputs
      mockCoreInputs({
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'label1,label2',
      });

      // Mock Octokit client with the expected properties
      mockOctokitClient({
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              labels: [{ name: 'label1' }, { name: 'label2' }],
              requested_reviewers: [
                { login: 'reviewer1' },
                { login: 'reviewer2' },
              ], // Required reviewers are present
            },
          }),
        },
        issues: {
          listComments: jest
            .fn()
            .mockReturnValue(Promise.resolve({ data: [] })),
          createComment: jest.fn().mockReturnValue(Promise.resolve({})),
          updateComment: jest.fn(),
          deleteComment: jest.fn(),
        },
      });

      // Mock core.setFailed
      core.setFailed = jest.fn();

      // Run the function
      await index.run();

      // Assertions
      expect(core.setFailed).not.toHaveBeenCalled(); // The function should not fail as required reviewers are present
      // You can add more detailed assertions here to check specific behaviors, such as not creating a comment or not updating an existing comment
    });
  });

  describe('comment handling', () => {
    it('should update existing comment if no required reviewer found and comment exists', async () => {
      mockCoreInputs({
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'label1,label2',
        'comment-message': 'commentMessage',
      });

      // Mock Octokit client
      const octokitMocks = {
        issues: {
          updateComment: jest.fn(),
          createComment: jest.fn(),
          listComments: jest.fn().mockResolvedValue({
            data: [{ body: 'commentMessage: reviewer1, reviewer2' }],
          }),
        },
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              labels: [{ name: 'label1' }, { name: 'label2' }],
              requested_reviewers: [],
            },
          }),
        },
      };

      mockOctokitClient(octokitMocks);

      // Run the function
      await index.run();

      // Assertions
      expect(core.setFailed).toHaveBeenCalledWith('Reviewers check failed.');
      expect(octokitMocks.issues.updateComment).toHaveBeenCalled();
    });

    it('should create a new comment if required labels are present, but no required reviewer(s) found, and no existing comment', async () => {
      // Mock core inputs
      mockCoreInputs({
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'label1,label2',
      });

      // Mock Octokit client with the expected properties
      let octokitMock = {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              labels: [{ name: 'label1' }, { name: 'label2' }], // Required labels are present
              requested_reviewers: [], // No reviewers
            },
          }),
        },
        issues: {
          listComments: jest
            .fn()
            .mockReturnValue(Promise.resolve({ data: [] })), // No existing comments
          createComment: jest.fn().mockReturnValue(Promise.resolve({})),
          updateComment: jest.fn(),
          deleteComment: jest.fn(),
        },
      };
      mockOctokitClient(octokitMock);

      // Mock core.setFailed
      core.setFailed = jest.fn();

      // Run the function
      await index.run();

      // Assertions
      expect(core.setFailed).toHaveBeenCalledWith('Reviewers check failed.');
      expect(octokitMock.issues.createComment).toHaveBeenCalled(); // A new comment should be created
    });

    it('should remove existing comment if required labels and reviewers are present', async () => {
      // Existing comment that starts with the required comment message
      const commentMessage = 'Required reviewers: ';

      // Mock core inputs
      mockCoreInputs({
        'required-reviewers': 'reviewer1,reviewer2',
        'required-labels': 'label1,label2',
        'comment-message': commentMessage,
      });

      // Mock Octokit client with the expected properties
      let octokitMock = {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              labels: [{ name: 'label1' }, { name: 'label2' }], // Required labels are present
              requested_reviewers: [
                { login: 'reviewer1' },
                { login: 'reviewer2' },
              ], // Required reviewers are present
            },
          }),
        },
        issues: {
          listComments: jest.fn().mockReturnValue(
            Promise.resolve({
              data: [
                {
                  id: 'existing-comment-id',
                  body: `${commentMessage}reviewer1, reviewer2`,
                },
              ], // Existing comment that matches the pattern
            })
          ),
          createComment: jest.fn(),
          updateComment: jest.fn(),
          deleteComment: jest.fn(), // This should be called to remove the comment
        },
      };
      mockOctokitClient(octokitMock);

      // Mock core.setFailed
      core.setFailed = jest.fn();

      // Run the function
      await index.run();

      // Assertions
      // No error should be thrown
      expect(core.setFailed).not.toHaveBeenCalled();

      // The existing comment should be deleted
      expect(octokitMock.issues.deleteComment).toHaveBeenCalledWith({
        comment_id: 'existing-comment-id',
        owner: 'owner',
        repo: 'repo',
      });

      // No new comment should be created or updated
      expect(octokitMock.issues.createComment).not.toHaveBeenCalled();
      expect(octokitMock.issues.updateComment).not.toHaveBeenCalled();
    });
  });

  describe('error tests', () => {
    it('should log an error message and fail the action if an error is thrown', async () => {
      // Mocks setup
      mockCoreInputs({});
      mockOctokitClient({
        pulls: {
          get: jest.fn().mockResolvedValue({ data: {} }),
        },
      });
      console.error = jest.fn();

      // Run the function
      await index.run();

      // Assertions
      expect(console.error).toHaveBeenCalled();
      expect(core.setFailed).toHaveBeenCalled();
    });
  });
});
