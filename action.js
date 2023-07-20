const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
    try {
        const token = core.getInput('github-token');
        const requiredReviewersInput = core.getInput('required-reviewers');
        const requiredReviewers = requiredReviewersInput.split(',').map((reviewer) => reviewer.trim());
        const labelsInput = core.getInput('labels');
        const requiredLabels = labelsInput.split(',').map((label) => label.trim());
        const commentMessage = core.getInput('comment-message') || 'Error: Pull request requires at least one of the following reviewers';

        const octokit = github.getOctokit(token);
        const { owner, repo, number } = github.context.issue;

        const pullRequest = await octokit.pulls.get({ owner, repo, pull_number: number });
        const labels = pullRequest.data.labels.map((label) => label.name);

        // Check if the pull request has the required labels
        const hasRequiredLabels = requiredLabels.every((requiredLabel) => labels.includes(requiredLabel));

        if (hasRequiredLabels) {
            const reviewers = pullRequest.data.requested_reviewers.map((reviewer) => reviewer.login);

            let foundReviewer = false;
            for (const requiredReviewer of requiredReviewers) {
                if (reviewers.includes(requiredReviewer)) {
                    foundReviewer = true;
                    break;
                }
            }

            if (!foundReviewer) {
                const missingReviewersList = requiredReviewers.join(', ');
                const comment = `${commentMessage}: ${missingReviewersList}`;
                console.log(comment);

                const comments = await octokit.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body === comment);

                if (!existingComment) {
                    await octokit.issues.createComment({ owner, repo, issue_number: number, body: comment });
                } else {
                    await octokit.issues.updateComment({ owner, repo, comment_id: existingComment.id, body: comment });
                }

                core.setFailed('Reviewers check failed.');
            } else {
                const comments = await octokit.issues.listComments({ owner, repo, issue_number: number });
                const existingComment = comments.data.find((comment) => comment.body.startsWith(commentMessage));

                if (existingComment) {
                    await octokit.issues.deleteComment({ owner, repo, comment_id: existingComment.id });
                }
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

await run();
