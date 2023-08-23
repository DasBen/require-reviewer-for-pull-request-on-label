const core = require('@actions/core');
const { getOctokit, context } = require('@actions/github');

/**
 * Checks if a pull request has the required reviewers based on specified labels.
 */
async function run() {
  try {
    // Get the GitHub token input
    const token = core.getInput('github-token', { required: true });
    if (token.trim().length === 0) {
      throw new Error('GitHub token not provided');
    }

    // Get the required reviewers input
    const requiredReviewersInput = core.getInput('required-reviewers', {
      required: true,
    });
    if (requiredReviewersInput.trim().length === 0) {
      throw new Error('Required reviewers not provided');
    }
    const requiredReviewers = requiredReviewersInput
      .split(',')
      .map((reviewer) => reviewer.trim());
    core.info(`Required Reviewers: ${requiredReviewers.join(', ')}`);

    // Get the required labels input
    const requiredLabelsInput = core.getInput('required-labels', {
      required: true,
    });
    if (requiredLabelsInput.trim().length === 0) {
      throw new Error('Required labels not provided');
    }
    const requiredLabels = requiredLabelsInput
      .split(',')
      .map((label) => label.trim());
    core.info(`Required Labels: ${requiredLabels.join(', ')}`);
    if (requiredLabelsInput.length === 0) {
      throw new Error('Required labels not provided');
    }

    // Get the comment message input or use a default message
    const commentMessage =
      core.getInput('comment-message') ||
      'Error: Pull request requires at least one of the following reviewers';
    core.info(`Comment Message: ${commentMessage}`);

    // Get the Octokit client using the provided token
    const octokit = getOctokit(token);

    // Get the owner and repo from the context
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const number = context.payload.pull_request.number;
    core.info(`Owner: ${owner}, Repo: ${repo}, Pull Request Number ${number}`);

    // Fetch the pull request details
    const pullRequest = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });
    const labels = pullRequest.data.labels.map((label) => label.name);
    core.info(`Pull Request Labels: ${labels.join(', ')}`);

    // Check if the pull request has some of the required labels
    const hasRequiredLabels = requiredLabels.some((requiredLabel) =>
      labels.includes(requiredLabel)
    );
    core.info(`Has Required Labels: ${hasRequiredLabels}`);

    if (hasRequiredLabels) {
      const reviewers = pullRequest.data.requested_reviewers.map(
        (reviewer) => reviewer.login
      );
      core.info(`Requested Reviewers: ${reviewers.join(', ')}`);

      let foundReviewer = false;
      for (const requiredReviewer of requiredReviewers) {
        if (reviewers.includes(requiredReviewer)) {
          foundReviewer = true;
          break;
        }
      }
      core.info(`Found Reviewer: ${foundReviewer}`);

      if (!foundReviewer) {
        const missingReviewersList = requiredReviewers.join(', ');
        const comment = `${commentMessage}: ${missingReviewersList}`;
        core.info(`Comment: ${comment}`);

        // Check if the comment already exists
        const comments = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: number,
        });
        const existingComment = comments.data.find((commentObj) =>
          commentObj.body.startsWith(commentMessage)
        );
        core.info(`Existing Comment: ${existingComment ? 'Yes' : 'No'}`);

        if (!existingComment) {
          // Create a new comment
          core.info('Creating a new comment...');
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: number,
            body: comment,
          });
        } else {
          // Update the existing comment
          core.info('Updating the existing comment...');
          await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existingComment.id,
            body: comment,
          });
        }

        core.setFailed('Reviewers check failed.');
      }
    }

    /**
     * Check if the comment already exists and remove it.
     * This will happen on:
     * 1. The pull request has all the required labels.
     * 2. The pull request has been updated and now passes the check.
     */
    const comments = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: number,
    });
    const existingComment = comments.data.find((comment) =>
      comment.body.startsWith(commentMessage)
    );
    core.info(`Existing Comment: ${existingComment ? 'Yes' : 'No'}`);

    if (existingComment) {
      // Delete the existing comment
      core.info('Deleting the existing comment...');
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existingComment.id,
      });
    }
  } catch (error) {
    // Log the error message
    console.error(error.message);

    // Set the action as failed
    core.setFailed(error.message);
  }
}

// This block will only run when this script is executed, but not when imported.
if (require.main === module) {
  (async () => {
    run();
  })();
}

module.exports = {
  run,
};
