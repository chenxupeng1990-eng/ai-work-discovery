# Project Agent Instructions

## Windows Local File Links

When referencing local files in responses:

- Always use an absolute Markdown link target in the `/C:/path/to/file` format.
- Always use forward slashes `/`, including for Windows paths.
- Never use backslashes `\` inside Markdown link targets.
- Never use `file://` URLs.
- Put optional line numbers inside the link target, for example:
  `[app.ts](/C:/Users/name/project/src/app.ts:42)`
- If the path contains spaces, wrap the target in angle brackets:
  `[My File.md](</C:/Users/name/My Project/My File.md:12>)`
- If a safe Markdown link cannot be generated, show the path as inline code instead of creating a clickable link.
- These rules also apply to subagents and code-review findings.

Incorrect:
`[file](C:\Users\name\.project\src\file.ts)`

Correct:
`[file](/C:/Users/name/.project/src/file.ts)`
