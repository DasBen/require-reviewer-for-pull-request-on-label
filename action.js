const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Checks if a pull request has the required reviewers based on specified labels.
 */
async function run() {
    try {
        // Get the GitHub token input
        const token = core.getInput('github-token');
        console.log(`GitHub Token used`);

        // Get the required reviewers input
        const requiredReviewersInput = core.getInput('required-reviewers');
        const requiredReviewers = requiredReviewersInput.split(',').map((reviewer) => reviewer.trim());
        console.log(`Required Reviewers: ${requiredReviewers.join(', ')}`);

        // Get the required labels input
        const labelsInput = core.getInput('required-labels');
        const requiredLabels = labelsInput.split(',').map((label) => label.trim());
        console.log(`Required Labels: ${requiredLabels.join(', ')}`);

        // Get the comment message input or use a default message
        const commentMessage = core.getInput('comment-message') || 'Error: Pull request requires at least one of the following reviewers';
        console.log(`Comment Message: ${commentMessage}`);

        // Get the Octokit client using the provided token
        const octokit = github.getOctokit(token);

        // Get the owner, repo, and pull request number from the context
        const { owner, repo, number } = github.context.issue;

        // Fetch the pull request details
        const pullRequest = await octokit.pulls.get({ owner, repo, pull_number: number });
        const labels = pullRequest.data.labels.map((label) => label.name);
        console.log(`Pull Request Labels: ${labels.join(', ')}`);

        // Check if the pull request has the required labels
        const hasRequiredLabels = requiredLabels.every((requiredLabel) => labels.includes(requiredLabel));
        console.log(`Has Required Labels: ${hasRequiredLabels}`);

        if (hasRequiredLabels) {
            const reviewers = pullRequest.data.requested_reviewers.map((reviewer) => reviewer.login);
            console.log(`Requested Reviewers: ${reviewers.join(', ')}`);

            let foundReviewer = false;
            for (const requiredReviewer of requiredReviewers) {
                if (reviewers.includes(requiredReviewer)) {
                    foundReviewer = true;
                    break;
                }
            }
            console.log(`Found Reviewer: ${foundReviewer}`);

            if (!foundReviewer) {
                const missingReviewersList = requiredReviewers.join(', ');
                const comment = `${commentMessage}: ${missingReviewersList}`;
                console.log(`Comment: ${comment}`);

                // Check if the comment already exists
                const comments = await octokit.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body === comment);

                if (!existingComment) {
                    // Create a new comment
                    console.log('Creating a new comment...');
                    await octokit.issues.createComment({ owner, repo, issue_number: number, body: comment });
                } else {
                    // Update the existing comment
                    console.log('Updating the existing comment...');
                    await octokit.issues.updateComment({ owner, repo, comment_id: existingComment.id, body: comment });
                }

                core.setFailed('Reviewers check failed.');
            } else {
                // Check if the comment already exists
                const comments = await octokit.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body.startsWith(commentMessage));

                if (existingComment) {
                    // Delete the existing comment
                    console.log('Deleting the existing comment...');
                    await octokit.issues.deleteComment({ owner, repo, comment_id: existingComment.id });
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
