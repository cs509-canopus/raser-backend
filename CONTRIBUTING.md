# Contributing Guide

This document lays out guidelines for contributing to RASER.

## Project board

The first step before writing any code should be to create an item on the 
[GitHub RASER project](https://github.com/orgs/cs509-canopus/projects/2).
The project has many views, one of which is a 
[Kanban board](https://en.wikipedia.org/wiki/Kanban_board),
which categorizes items into the following categories:
- **Backlog**: starting point for all tasks
- **Ready**: tasks that are assigned and ready to be started
- **In progress**: tasks that are currently being worked on
- **In review**: tasks that are done and have been made into a pull request that are 
  awaiting review
- **Done**: tasks that have been merged

Every item on the project board corresponds to an issue on one of the repositories. 

## Issues

Naming should adhere to the following format:

```
<type>: <short description>
```

Where `<type>` is one of the values in the table below. Additionally, a corresponding
Label and Type should be added to the issue. The `<short description>` should describe
what needs to be done.

| Issue type             | `<type>` | Label         | Type    |
| ---------------------- | -------- | ------------- | ------- |
| New feature            | `feat`   | feature       | Feature |
| Bug fix                | `fix`    | bug           | Bug     |
| Updating documentation | `docs`   | documentation | Task    |
| Housekeeping / chores  | `chore`  | chore         | Task    |
| Miscellaneous          | `misc`   |               | Task    |

For miscellaneous tasks that do not fall into one of the other categories, you can assign
more than one label.

Example (see [#1](https://github.com/cs509-canopus/raser-backend/issues/1)):

```
docs: create contributing guide
```

## Branches

Branches should be created from the issue page. One the right sidebar, under Development,
click "Create a branch" and name it as follows:

```
<type>/<user>/NN-short-description
```

Replace `<type>` with the same type from the issue, `<user>` with your username (e.g., 
`asuyer`), `NN` with the issue number, and include a short couple word description that is
related to the name of the issue.

Example:

```
docs/asuyer/1-contributing-guide
```

After creating the branch on GitHub, you can checkout the branch locally with:

```sh
git fetch origin
git checkout -b <branch-name>
```

## Commits

When developing a feature locally, you can commit however you want. There is no guidance
for how to format commit messages or how often to commit. However, it is good practice to
commit whenever you are at a checkpoint that you might want to come back to later. After
every commit, you can `git push` so that GitHub stays up-to-date with the work you are 
doing.

## Pull requests

### Before-merge checklist

#todo

### Creating the PR

Once development on a local branch is done, `git push` it and create a pull request on 
GitHub. Set the source branch to your branch and the base branch to `staging`, **not
`main`**. The `main` branch is reserved for the production environment and will only be
merged into during a release.

```
staging <-- <your-branch>
```

Name your pull request following the same format as an issue. You do *not* have to use the
same name as the issue. The name of the pull request should reflect what was done, not
what needed to be done.

```
<type>: <short description>
```

Every pull request should be assigned **reviewers** based on the established team roles.
All backend-related PRs should request review from the backend master. All
frontend-related PRs should request review from the frontend master. Any PR that involves
the database should request review from the database master. If you are one of these roles
and need a reviewer, then assign someone else of your choosing.

Link the PR to the **project** RASER under the project section in the right sidebar, and
associate it with the appropriate **milestone**.

In the **body** of the PR, include a summary of the changes you made. A list of the
commits you made on your branch is a valid PR body. **Also**, be sure to include a
[closing keyword](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
to link the PR to an issue (e.g., "Closes `NN`", where `NN` is the issue number).

Example body:

```
- commit a message
- commit b message
- commit c message

Closes #1
```

After creating the PR, you can **move the item on the project board to the "In review" 
stage.**

## Reviewing pull requests

#todo
- Make sure code is well formatted
- Checkout locally and run tests


## Merging pull requests

#todo
- Squash and merge, and use a [conventional commit message](https://www.conventionalcommits.org/en/v1.0.0/#summary)


```
<type>[optional scope]: <description>

[optional body]
```

Example:

```
feat(api): added /login endpoint to gateway with lambda handler
```


