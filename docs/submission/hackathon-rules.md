# Graph Hacks: Context for AI Agents: rules summary

Date checked: 2026-10-15. All event pages were rendered in a browser, and every FAQ entry was expanded and read.
Organiser: WeMakeDevs, with FalkorDB as sponsor. When you register, you agree to the Rules page and the WeMakeDevs Code of Conduct.
This is a paraphrased summary. If anything here disagrees with the pages below, the pages win.

## Sources

| Source | URL |
|---|---|
| Overview, Tracks, Prizes, FAQ | https://www.wemakedevs.org/hackathons/falkordb |
| Rules (binding) | https://www.wemakedevs.org/hackathons/falkordb/rules |
| Schedule | https://www.wemakedevs.org/hackathons/falkordb/schedule |
| Resources | https://www.wemakedevs.org/hackathons/falkordb/resources |
| Submit page (needs sign-in; only the sign-in gate was viewed) | https://www.wemakedevs.org/hackathons/falkordb/submit |
| Public event config that the event page loads (dates, team size, registration questions) | https://wemakedevs-server.onrender.com/hackathons/falkordb |
| Official WeMakeDevs guide, posted 2026-10-15 by Aayush Sharma (COO) | https://www.wemakedevs.org/blogs/how-to-build-an-agent-that-reasons-over-a-graph |
| WeMakeDevs Code of Conduct (applies through the Rules) | https://www.wemakedevs.org/coc |
| FalkorDB Discord, for help and announcements (not read, because it requires joining) | https://discord.com/invite/Y2mMT9VdMy |

## Key dates

| Milestone | Official time (IST, UTC+5:30) | UTC | GMT+4 (local time shown by the site) |
|---|---|---|---|
| Hacking begins | Thu 15 Oct 2026, 00:01 | 14 Oct, 18:31 | 14 Oct, 22:31 |
| Submission form opens | The Schedule page says at the start. The platform config says Sat 17 Oct, 01:03 | 16 Oct, 19:33 | 16 Oct, 23:33 |
| **Submissions close (hard deadline)** | **Sun 18 Oct 2026, 23:59** | **18 Oct, 18:29** | **18 Oct, 22:29** |
| Judging and results | Not published | | |

- Registration is open now, and you can add teammates until submissions close. No late-submission window is configured: the config has `submissions_close_at` set to null, so submissions close when the event ends.
- The submit page's interface says an entry can be edited or withdrawn until submissions close. This is platform behaviour. The Rules do not say it.

## Format and eligibility

- The event is online, open to developers worldwide, and free to enter. No graph database experience is needed. About 7.2k people had registered when this was checked.
- You can enter solo or in a team of up to 4, and each person can be on only one team.
- You need a WeMakeDevs account and a registration. The team and the submission are both managed from the event panel.
- Intellectual property belongs to the people who built the project.

## Tracks

Paraphrased. You can enter one, two or all three tracks, and you must name every track you enter when you submit.

| Track | What it asks for | Focus areas |
|---|---|---|
| 01: Agents That Act on Connected Data | An agent that uses the graph to decide and act. The examples are fraud investigation, security triage and working through a codebase. | Multi-hop reasoning; graph queries and algorithms used as agent tools; tool selection through MCP; actions driven by what the graph shows; explainable results |
| 02: Agent Memory and Coordination | Agents that remember across sessions and share state. Memory should persist, update over time, and be available to every agent that needs it. | Episodic, semantic and procedural memory; persistent conversation history; shared state and handoffs between agents; high-concurrency reads and writes; separate memory per user or tenant |
| 03: Company Brain | An agent that understands how a company works, with people, teams, projects, documents and decisions in one graph, so it can answer questions and get work done. | Docs, tickets and chats in one graph; who owns what and who knows what; tracing decisions back to their source; keeping knowledge current; answers with clear sources |

## Prizes ($20,000 in total)

- **Best project in each track:** Track 01 wins an iPhone 18 Pro, Track 02 a PS5 with GTA VI, and Track 03 an M6 Mac Mini. Every member of a winning team gets the prize.
- **Side prize for the best blog post about your project:** AirPods 5, one winner.
- **Side prize for the top 50 submissions:** a t-shirt for every team member, shipped to them.
- **Registration-form giveaway:** this comes from the event config and is not on the public pages. If you star `github.com/FalkorDB/falkordb`, you enter a random draw for a Keychron keyboard worth about US$150. Entering requires your GitHub username.

## Judging criteria

**No rubric is published.** There are no weights, no named judges, no judging period and no results date. The `judging_deadline` field in the config is also empty. The signals available are:
- The Rules say the original work done during the hackathon is what gets judged, and that FalkorDB has to be central to the product.
- The official WeMakeDevs guide says that in every track, judging comes back to "whether the graph is doing work the agent could not do without it".
- The focus areas for each track, in the table above, are the best available stand-in for criteria.

## Requirements

| Requirement | Source | How ClauseRipple satisfies it |
|---|---|---|
| Solo or up to 4 members, one team per person, registered on WeMakeDevs | Rules 1; FAQ | Planned: a solo entry by Bilal Feroz, registered on WeMakeDevs before submitting. |
| FalkorDB is the primary graph database and powers a central part of the product | Rules 2; FAQ | Planned: the whole company graph lives in FalkorDB. That covers customers, contracts, clauses, obligations, vendors, systems, products, teams, people, decisions, ImpactCases and AgentRuns. There is no other primary datastore. |
| The graph does real work. A product that still works with FalkorDB removed does not qualify, and neither does a visualisation over ordinary storage. | Rules 3 | Planned: finding impacted customers, looking up residency obligations, recalling prior decisions and resolving owners are all multi-hop Cypher traversals. The ImpactCase and the assignment are written back to FalkorDB. RippleSpace (3D) and the evidence graph (2D) draw live query results. |
| FalkorDB runs on Docker, self-hosted, or FalkorDB Cloud. Any language, framework or platform is allowed. | Rules 4; FAQ | Planned: Docker for local development, FalkorDB Cloud for the live demo, and a Next.js frontend. |
| Name every track entered | Rules 5, 10 | Planned: Track 01 and Track 03. Track 02 only if real cross-session memory or multi-agent coordination ships. |
| Use only public, synthetic or your own data. Nothing private, personal, login-protected or paywalled. | Rules 6 | Planned: fully synthetic seed data, labelled as fictional in the README and UI. "ModelCloud" is also the name of a real company (ModelCloud.AI), so mark it as fictional or rename it. |
| Main coding and design start after 15 Oct, 00:01 IST. Ideas, notes and sketches made beforehand are allowed. | Rules 8 | Planned: all code is written during the event. The repo had no commits when this was checked, so the first commit will come after kickoff. |
| The submission and its main FalkorDB implementation are new work. Libraries, templates, infrastructure and public datasets may be reused. | Rules 9; FAQ | Planned: a new repo, with third-party libraries credited in the README. |
| Public source-code repository | Rules 10 | Planned: https://github.com/bilal-feroz/ClauseRipple, made public before submission. |
| README with setup instructions and the graph data model | Rules 10 | Planned: the README covers setup (Docker or Cloud, environment variables, seeding, running) and includes a node and edge schema diagram with descriptions. |
| The Cypher queries or graph algorithms the product depends on | Rules 10 | Planned: each agent tool's Cypher is kept in version-controlled files and listed in the README with its purpose. Any FalkorDB algorithm used, such as shortest path, is documented. |
| Demo video showing the working project | Rules 10; Schedule | Planned: a screen recording of the flow from DPA change, through the agent's trace, to the ImpactCase being written back. No length or platform is specified, so aim for 3 minutes or less as an unlisted YouTube video, which is WeMakeDevs precedent (see below). |
| Live deployment (preferred), or complete local setup instructions | Rules 10; FAQ | Planned: a hosted Next.js app on FalkorDB Cloud, with the full local setup kept in the README as a fallback. |
| Disclose AI coding assistant use | Rules 11 | Planned: AI_ASSISTANCE.md, which discloses Claude Code use, says what was designed and verified by a human, and is linked from the README and the submission. |
| Be able to explain the graph model, queries, architecture and decisions | Rules 12; FAQ | Planned: architecture and decision notes in `docs/`. The author reviews every query and tool. |
| The project is not wholly AI-generated without meaningful contribution, verification or understanding | Rules 13 | Planned: the graph model, the scenario and the deterministic residency checks are human-owned, and tests and manual verification are recorded. |
| Respectful conduct, no plagiarism, no attempts to manipulate judging | Rules 16 to 18; CoC | Planned: original code, with any third-party assets attributed. |
| Submit the repo, README, demo video, deployment and project info before the deadline | Schedule | Planned: submit through the WeMakeDevs panel once the form opens, well before 18 Oct, 23:59 IST. |
| Optional blog post about the project, for the side prize | Overview | Planned, optional: a write-up of the graph model and agent design, linked in the submission if the form has a field for it. |

## What is not required

- **MCP** is not mandatory. Tool selection through MCP is a Track 01 focus area and a listed FalkorDB integration, and ClauseRipple's MCP tool server matches it directly.
- **Graph algorithms** are optional. Documented Cypher queries meet the submission rule, though algorithms as agent tools is a Track 01 focus area.
- **Repo creation date and commit history:** no rule is published. Main coding still has to start after kickoff, so keep commits honest and incremental.
- **Video length, video platform and hosting provider** are not specified.

## Open questions and unpublished details

1. **Judging:** the rubric, weights, judges, judging period and results date are not published.
2. **Submission form fields:** the form had not been set up when this was checked (`submission_questions` is null). The config says it opens on 16 Oct at 19:33 UTC, which contradicts the Schedule page's statement that it opens at the start. Check again for fields such as video URL, blog link and AI disclosure.
3. **Entering several tracks:** the Rules and FAQ allow any or all tracks, each with its own prize. The official WeMakeDevs guide says each submission is judged in one track. The past WeMakeDevs forms noted below allowed several tracks but only one win. Ask in the FalkorDB Discord.
4. **Blog side prize:** no platform, deadline, length or submission method is given.
5. **Kickoff session:** the FAQ mentions one, but the Schedule page gives no time or link.
6. **Deployment:** it is unclear whether an entry with no deployment, only a video and local setup, is scored lower. A live deployment is "preferred". The official guide points to FalkorDB Cloud for this.
7. **Rule changes:** changes go out through the WeMakeDevs and FalkorDB community channels, mainly Discord, which was not checked.

## Precedent (not official for Graph Hacks)

The two most recent hackathons on the same WeMakeDevs platform were First Commit (Sep 2026) and Environmental Hacks (Oct 2026). Their submission forms asked for:
- a public GitHub repo with a proper README and a commit history;
- a YouTube demo, public or unlisted, of 3 minutes or less;
- an optional deployed URL;
- a track checkbox, noting that a project could enter several tracks but win only one;
- optional blog links.

Prepare for the same unless the Graph Hacks form says otherwise.

## Useful official resources

- Getting started: https://docs.falkordb.com/getting-started/
- Docker setup: https://docs.falkordb.com/operations/docker
- FalkorDB Cloud: https://app.falkordb.cloud
- Cypher reference: https://docs.falkordb.com/cypher/
- Algorithms: https://docs.falkordb.com/algorithms/
- Integrations, including MCP: https://docs.falkordb.com/integration/
- Client libraries: https://docs.falkordb.com/getting-started/clients
- FalkorDB Browser: https://docs.falkordb.com/browser/
