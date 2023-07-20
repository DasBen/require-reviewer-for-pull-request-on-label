# Check Reviewers Action

This GitHub Action checks if a pull request has the required reviewers based on specified labels.

## Inputs

### `github-token` (required)

The GitHub token used to authenticate API requests. You can use the `secrets.GITHUB_TOKEN` to access a token
automatically provided by GitHub Actions.

### `required-reviewers` (required)

A comma-separated list of the required reviewers' usernames.

### `required-labels` (required)

A comma-separated list of the labels that trigger the reviewers check. The check will trigger as soon as one of these
labels are present.

### `comment-message` (optional)

A custom message to be displayed as a comment when the required reviewers are missing. If not provided, a default
message will be used.

## Example Usage

```yaml
name: Reviewers Check

on:
  pull_request:
    types: [opened, reopened, labeled, unlabeled, review_requested, review_request_removed]

jobs:
  check-reviewers:
    runs-on: ubuntu-latest

    steps:
      - name: Check Reviewers
        uses: DasBen/require-reviewer-for-pull-request-on-label@<release-version>
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          required-reviewers: 'Reviewer1, Reviewer2'
          required-labels: 'required-label1, required-label2'
          comment-message: 'Custom Error: Pull request requires at least one of the following reviewers'
