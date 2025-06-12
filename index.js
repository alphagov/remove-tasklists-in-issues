import { createTokenAuth } from "@octokit/auth-token";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { stringify } from 'csv-stringify';
import { createWriteStream } from 'node:fs';

const {authToken, repositories} = getCLIParameters();

const octokit = await getAuthenticatedOctokit(authToken);

const issues = getCSVStringifier("results/issues.csv", {
    columns: [
        'Issue',
        'Priority',
        'Complexity',
        'Work on it',
        'Priority',
        'Complexity',
        'Work on it'
    ]
})

repositories: for (const repository of repositories) {
    for await (const issue of getIssuesMatchingFilter(octokit, repository, (issue) => issue.pull_request)) {
        // Escape quotes for the title
        const sheetsReadyTitle = issue.title.replaceAll('"','""')
        issues.write([`=HYPERLINK("${issue.html_url}", "${sheetsReadyTitle}")`])

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
 * Creates a WriteableStream that outputs a CSV at the given path
 * 
 * @param {string} path 
 * @returns {WritableStream}
 */
function getCSVStringifier(path, stringifyOptions) {
    const stringifier = stringify({
        header: true,
        // Quote the URLs so they're clearly delimited and the `,` delimiter
        // is not interpreted as part of the URL
        quoted_match: /http/,
        ...stringifyOptions
    });
    const output = createWriteStream(path);
    stringifier.pipe(output);

    return stringifier;
}

/**
 * Yield issues that match the given filter
 * 
 * @param {Octokit} octokit 
 * @param {string} repo 
 * @param {function} filter
 */
async function* getIssuesMatchingFilter(octokit, repo, filter) {
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
                .filter(filter)
        
        for (const issue of issues) {
            yield issue
        }
    }
}
