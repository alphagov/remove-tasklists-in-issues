import { createTokenAuth } from "@octokit/auth-token";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";

const {authToken, repositories} = getCLIParameters();

const octokit = await getAuthenticatedOctokit(authToken);

repositories: for (const repository of repositories) {
    for await (const issue of getIssuesWithTasklist(octokit, repository)) {
        console.log(issue);

        if (process.env.FIRST?.toLowerCase() === 'issue') {
            break repositories;
        }
    }

    if (process.env.FIRST?.toLowerCase()?.startsWith('repo')) {
        break;
    }
}

function getCLIParameters() {
    const authToken = process.env['GITHUB_PAT'];
    if (!authToken) {
        console.error(`Missing GitHub Personal Access Token

Please create a Personal Access Token with the 'repo' scope at https://github.com/settings/tokens.
Then use the \`GITHUB_PAT\` environment variable to provide it to the script:

\`\`\`
GITHUB_PAT=<YOUR_TOKEN> npm start -- <REPOSITORY_1>
\`\`\``)
    }

    const repositories = process.argv.slice(2)
    return {
        authToken,
        repositories
    }
}

async function getAuthenticatedOctokit(personalAccessToken) {
    console.info('🔒 Authenticating with GitHub')
    // https://github.com/octokit/authentication-strategies.js/?tab=readme-ov-file#personal-access-token-authentication
    const auth = createTokenAuth(personalAccessToken);
    const { token } = await auth();

    console.info('🏗️ Creating Octokit instance')
    const CustomOctokit = Octokit.plugin(paginateRest);
    return new CustomOctokit({ auth: token });
}

/**
 * Yield issues that use tasklist inside the given repo
 * 
 * @param {Octokit} octokit 
 * @param {string} repo 
 */
async function* getIssuesWithTasklist(octokit, repo) {
    console.info('💬 Requesting issues')

    const parameters = {
        owner: "alphagov",
        repo,
        // Tasklist public beta started Apr 2023, giving the script a little room for
        // error https://github.com/github/roadmap/issues/760
        since: "2023-01-01",
        state: "all",
        per_page: 100,
    }

    const issuePages = octokit.paginate.iterator(
        "GET /repos/{owner}/{repo}/issues",
        parameters,
    );

    for await (const response of issuePages) {
        const [_,page] = response.url.match(/&page=(\d+)$/) || [null, 1];

        console.log('Processing page', page)
        const issues = 
            response.data
                // Pull requests are also considered issues on GitHub
                // so we need to filter those out
                .filter(issue => !issue.pull_request)
                // Then we can dig for the issues we're looking for
                .filter(issue => issue.body?.includes('```[tasklist]'));
        
        for (const issue of issues) {
            yield issue
        }
    }
}