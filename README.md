# Remove Tasklists in issues

GitHub is retiring its tasklist feature on April 30th 2025. 
Many of our issues have tasklists in their Markdown.

This script uses the GitHub API through [Octokit](https://github.com/octokit/octokit.js) to find issues which use tasklists in their description. 

Using [remark](https://remark.js.org/), we can then remove the ````[tasklist]` blocks to turn the tasklists into plain checklists.

## Usage

The script needs a [Personal Access Token](https://github.com/settings/tokens) with [the 'repo' scope](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) so it can access issues in internal or private repositories.

```sh
npm ci
GITHUB_PAT=<YOUR_PERSONAL_ACCESS_TOKEN> npm start -- <REPOSITORY_IN_ALPHAGOV_1> <REPOSITORY_IN_ALPHAGOV_2>
```

For testing you can use the `FIRST` environment variable to process only:
- the first issue with `FIRST=issue`
- the first repository in the list with `FIRST=repo` or `FIRST=repository`
