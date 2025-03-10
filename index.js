import { createTokenAuth } from "@octokit/auth-token";
import { Octokit } from "@octokit/core";

const {authToken, repositories} = getCLIParameters();

const octokit = await getAuthenticatedOctokit(authToken);

for (const repo of repositories) {
    const parameters = {
        owner: "alphagov",
        repo,
        // Tasklist public beta started Apr 2023, giving the script a little room for
        // error https://github.com/github/roadmap/issues/760
        since: "2023-01-01",
        state: "all",
        per_page: 5,
    }

    console.log(await octokit.request("GET /repos/{owner}/{repo}/issues", parameters))
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
    return new Octokit({ auth: token });
}