const axios = require("axios");
const path = require("path");
const express = require("express");

const {
  gh_token,
  gh_url,
  gh_org,
  gh_repo,
  zh_url,
  zh_token,
  zh_repo
} = require(".config.json");

const app = express();
const port = process.env.PORT || port || 3000;
const token = process.env.ZENHUB_TOKEN || zh_token;
const gh_token = process.env.GITHUB_TOKEN || gh_token;

app.use(express.static(path.resolve(__dirname, "public")));
app.get("/graph", async (req, res) => {
  const checkForError = ({ errors }) => {
    if (errors) {
      console.error(errors);
      process.exit(1);
    }
  };

  const firstIssues = `
    query {
      organization(login:${gh_org}) {
        repository(name:${gh_repo}) {
          issues( first:100 ) {
            edges {
              node {
                title
                number
                closed
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
      }
    }
  }`;

  console.log("Fetching first issues");

  let { data: firstIssuesRes } = await axios.post(
    `${gh_url}/graphql`,
    { query: firstIssues },
    { headers: { Authorization: `bearer ${gh_token}` } }
  );

  checkForError(firstIssuesRes);

  const { edges: issues, pageInfo } =
    firstIssuesRes.data.organization.repository.issues;

  let nodes = issues.map(({ node }) => ({
    id: node.number,
    title: node.title,
    closed: node.closed,
    isEpic: false,
  }));

  console.log("Fetched %d issues", nodes.length);

  let { hasNextPage, endCursor } = pageInfo;

  while (hasNextPage) {
    const cursorIssues = `
    query($endCursor:String!) {
      organization(login:${gh_org}) {
        repository(name:${gh_repo}) {
          issues( first: 100, after:$endCursor) {
            edges {
              node {
                title
                number
                closed
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
      }
    }
  }`;

    console.log("Fetching next page of issues");

    let { data: pageRes } = await axios.post(
      `${gh_url}/graphql`,
      { query: cursorIssues, variables: { endCursor } },
      { headers: { Authorization: `bearer ${gh_token}` } }
    );

    checkForError(pageRes);

    const { edges: issues, pageInfo } =
      pageRes.data.organization.repository.issues;

    console.log("Fetched %d issues", issues.length);

    issues
      .map(({ node }) => ({
        id: node.number,
        title: node.title,
        closed: node.closed,
        isEpic: false,
      }))
      .forEach((x) => nodes.push(x));

    hasNextPage = pageInfo.hasNextPage;
    endCursor = pageInfo.endCursor;
  }

  console.log("Fetching issue dependencies");

  const { data: deps } = await axios.get(
    `${`zh_url}/api/p1/repositories/${zh_repo}/dependencies`,
    {
      headers: {
        "X-Authentication-Token": token,
        "Content-Type": "application/json",
      },
    }
  );

  checkForError(deps);

  const { dependencies } = deps;

  const edges = dependencies.map((dep) => {
    const {
      blocking: { issue_number: blocking },
      blocked: { issue_number: blocked },
    } = dep;

    return { target: blocked, source: blocking, type: "dependency" };
  });

  console.log("Fetched %d dependencies", edges.length);

  console.log("Fetching epics");
  const { data: epics } = await axios.get(
   `${zh_url}/api/p1/repositories/${zh_repo}/epics`,
    {
      headers: {
        "X-Authentication-Token": token,
        "Content-Type": "application/json",
      },
    }
  );

  checkForError(epics);

  const epicNumbers = epics.epic_issues.map((issue) => issue.issue_number);

  epicNumbers.forEach((number) => {
    const issue = nodes[number];
    if (issue) {
      nodes[number] = { ...issue, isEpic: true };
    }
  });

  console.log("Fetched %d epics", epicNumbers.length);

  console.log("Fetching epic issues");

  const epicEdges = await epicNumbers.reduce(async (prev, number) => {
    const edges = await prev;
    const { data: epic } = await axios.get(
     `${zh_url}/api/p1/repositories/${zh_repo}/epics/${number}`,
      {
        headers: {
          "X-Authentication-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    checkForError(epic);

    const issues = epic.issues.map((issue) => ({
      target: issue.issue_number,
      source: number,
      type: "epic",
    }));

    return [...edges, ...issues];
  }, Promise.resolve([]));

  console.log("Fetched %d epic issues", epicEdges.length);
  console.log("Completed fetch of nodes and edges");
  res.json({ edges: [...edges, ...epicEdges], nodes });
});

app.listen(port, () => console.log(`Listening on ${port}`));
