import { createTokenAuth } from "@octokit/auth-token";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { stringify } from 'csv-stringify';
import { createWriteStream } from 'node:fs';

/////////////////
/// Configuration
/////////////////

/**
 * The columns that'll be output in the CSV
 */
const CSV_COLUMNS = [
    'Issue',
    'Priority',
    'Complexity',
    'Work on it',
    'Priority',
    'Complexity',
    'Work on it'
]

/**
 * Filter the issues that'll be included in the CSV
 * @param {Object} issue 
 * @returns {boolean}
 */
function filterIssues(issue) {
    return issue.state !== 'closed' && !issue.pull_request
}

/**
 * Converts the issue to CSV columns
 * 
 * @param {Object} issue 
 * @returns {Array<any>}
 */
function toCSVColumns(issue) {
    // Escape quotes for the title
    const sheetsReadyTitle = issue.title.replaceAll('"','""')
    return [`=HYPERLINK("${issue.html_url}", "${sheetsReadyTitle}")`]
}

/**
 * Parameters provided to Octokit when fetching the issues/PRs
 */
const API_PARAMETERS = {
    owner: "alphagov",
    per_page: 100,
}

/**
 * The endpoint Oktokit should hit to grab a list of issues or pull requests
 * 
 * @type {'issues'|'pulls'}
 */
const ENDPOINT = 'issues'

///////////////////
/// Doing the work
///////////////////

const {authToken, repositories} = getCLIParameters();

const octokit = await getAuthenticatedOctokit(authToken);

const issues = getCSVStringifier("results/issues.csv", {
    columns: CSV_COLUMNS
})

repositories: for (const repository of repositories) {
    for await (const issue of getIssuesMatchingFilter(octokit, repository, filterIssues)) {
        
        issues.write(toCSVColumns(issue))

        if (process.env.FIRST?.toLowerCase() === 'issue') {
            break repositories;
        }
    }

    if (process.env.FIRST?.toLowerCase()?.startsWith('repo')) {
        break;
    }
}

/////////////
/// Internals
/////////////

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
        ...API_PARAMETERS,
        repo
    }

    const issuePages = octokit.paginate.iterator(
        `GET /repos/{owner}/{repo}/${ENDPOINT}`,
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
