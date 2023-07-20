const core = require('@actions/core');
const { getOctokit, context } = require('@actions/github');

/**
 * Checks if a pull request has the required reviewers based on specified labels.
 */
async function run() {
    try {
        // Get the GitHub token input
        const token = core.getInput('github-token');

        // Get the required reviewers input
        const requiredReviewersInput = core.getInput('required-reviewers');
        const requiredReviewers = requiredReviewersInput.split(',').map((reviewer) => reviewer.trim());
        core.debug(`Required Reviewers: ${requiredReviewers.join(', ')}`);

        // Get the required labels input
        const labelsInput = core.getInput('required-labels');
        const requiredLabels = labelsInput.split(',').map((label) => label.trim());
        core.debug(`Required Labels: ${requiredLabels.join(', ')}`);

        // Get the comment message input or use a default message
        const commentMessage = core.getInput('comment-message') || 'Error: Pull request requires at least one of the following reviewers';
        core.debug(`Comment Message: ${commentMessage}`);

        // Get the Octokit client using the provided token
        const octokit = getOctokit(token);

        // Get the owner and repo from the context
        const owner = context.repo.owner;
        const repo = context.repo.repo;
        const number = context.payload.pull_request.number;
        core.debug(`Owner: ${owner}, Repo: ${repo}, Pull Request Number ${number}`);

        // Fetch the pull request details
        const pullRequest = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
        const labels = pullRequest.data.labels.map((label) => label.name);
        core.debug(`Pull Request Labels: ${labels.join(', ')}`);

        // Check if the pull request has some of the required labels
        const hasRequiredLabels = requiredLabels.some((requiredLabel) => labels.includes(requiredLabel));
        core.debug(`Has Required Labels: ${hasRequiredLabels}`);

        if (hasRequiredLabels) {
            const reviewers = pullRequest.data.requested_reviewers.map((reviewer) => reviewer.login);
            core.debug(`Requested Reviewers: ${reviewers.join(', ')}`);

            let foundReviewer = false;
            for (const requiredReviewer of requiredReviewers) {
                if (reviewers.includes(requiredReviewer)) {
                    foundReviewer = true;
                    break;
                }
            }
            core.debug(`Found Reviewer: ${foundReviewer}`);

            if (!foundReviewer) {
                const missingReviewersList = requiredReviewers.join(', ');
                const comment = `${commentMessage}: ${missingReviewersList}`;
                core.debug(`Comment: ${comment}`);

                // Check if the comment already exists
                const comments = await octokit.rest.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body === comment);
                core.debug(`Existing Comment: ${existingComment ? 'Yes' : 'No'}`);

                if (!existingComment) {
                    // Create a new comment
                    core.debug('Creating a new comment...');
                    await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body: comment });
                } else {
                    // Update the existing comment
                    core.debug('Updating the existing comment...');
                    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existingComment.id, body: comment });
                }

                core.setFailed('Reviewers check failed.');
            } else {
                // Check if the comment already exists
                const comments = await octokit.rest.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body.startsWith(commentMessage));
                core.debug(`Existing Comment: ${existingComment ? 'Yes' : 'No'}`);

                if (existingComment) {
                    // Delete the existing comment
                    core.debug('Deleting the existing comment...');
                    await octokit.rest.issues.deleteComment({ owner, repo, comment_id: existingComment.id });
                }
            }
        }
    } catch (error) {
        // Log the error message
        console.error(error.message);

        // Set the action as failed
        core.setFailed(error.message);
    }
}

// Run the action
run();
