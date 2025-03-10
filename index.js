import { createTokenAuth } from "@octokit/auth-token";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { stringify } from 'csv-stringify';
import { createWriteStream } from 'node:fs';
import { remark } from "remark";
import { selectAll } from "unist-util-select";

const {authToken, repositories} = getCLIParameters();

const octokit = await getAuthenticatedOctokit(authToken);

const stringifier = getCSVStringifier("results/issues.csv")

repositories: for (const repository of repositories) {
    for await (const issue of getIssuesWithTasklist(octokit, repository)) {
        stringifier.write([repository, issue.title, issue.html_url, issue.created_at, issue.updated_at])

        const childIssues = [];

        const bodyWithoutTasklists = removeTasklist(issue.body, {
            beforeTransform(tasklistNode) {
                childIssues.push(...getChildIssuesUrls(tasklistNode))
            }
        })

        console.log(childIssues);

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
function getCSVStringifier(path) {
    const stringifier = stringify({
        columns: [
            'Repository',
            'Title',
            'URL',
            'Created At',
            'Updated At'
        ],
        header: true,
        // Quote the URLs so they're clearly delimited and the `,` delimiter
        // is not interpreted as part of the URL
        quoted_match: /http/
    });
    const output = createWriteStream(path);
    stringifier.pipe(output);

    return stringifier;
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

/**
 * Turn tasklists blocks in the given issueBody into plain checklists
 * 
 * Use the `beforeTransform` callback to process the tasklist node
 * before it is transformed
 * 
 * @param {string} issueBody 
 * @param {RemoveTasklistOptions} options
 * @returns {string} The body of the issue, without
 */
function removeTasklist(issueBody, {beforeTransform} = {}) {
    const ast = remark.parse(issueBody);

    const tasklists = selectAll('code[lang="[tasklist]"]', ast);
    for(const tasklist of tasklists) {
        if (beforeTransform) {
            beforeTransform(tasklist)
        }

        // Use 'html' as a type so remark renders the content of the tasklist as is
        tasklist.type = "html"
        delete tasklist.lang;

        // Properly escape the leading `[` of the checklists now they're out of code blocks
        // GitHub likely does a fair job of normalising the tasklists to not have whitespace
        // before the `-` and use a `-` (not a `*` or `+`), but in case.
        // We need the `g` flag for `replaceAll` as well as the `m` so each line is considered
        // independently here
        tasklist.value = tasklist.value.replaceAll(/^\s*[+*-] \[/gm,'- \\[')
    }

    return remark.stringify(ast)
}

/**
 * @typedef RemoveTasklistOptions
 * @property {import('remark').Node[] => void} beforeTransform
 */

function getChildIssuesUrls(tasklistNode) {
    const tasklistContent = remark.parse(tasklistNode.value);
    const itemsText = selectAll('listItem text', tasklistContent);
    return itemsText
        // First only consider links to other issues
        .filter(({value}) => value.match(/issues\/\d+/))
        // Then tidy up the text, removing the leading `[ ] `
        // looking for leading non-word characters as the first `[`
        // may be escaped
        .map(({value}) => value.replace(/^[^\w]*/,''))
}