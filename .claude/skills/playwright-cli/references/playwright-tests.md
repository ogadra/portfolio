# Running Playwright Tests

To run Playwright tests, use the `npx playwright test` command, or a package manager script. To avoid opening the interactive html report, use `PLAYWRIGHT_HTML_OPEN=never` environment variable.

```bash
# Run all tests
PLAYWRIGHT_HTML_OPEN=never npx playwright test

# Run all tests through a custom npm script
PLAYWRIGHT_HTML_OPEN=never npm run special-test-command
```

# Debugging Playwright Tests

To debug a failing Playwright test, run it with `--debug=cli` option. This command will pause the test at the start and print the debugging instructions.

**IMPORTANT**: run the command in the background and check the output until "Debugging Instructions" is printed. Make sure to stop the command after you have finished.

Once instructions containing a session name are printed, use `playwright-cli` to attach the session and explore the page.

```bash
# Run the test
PLAYWRIGHT_HTML_OPEN=never npx playwright test --debug=cli
# ...
# ... debugging instructions for "tw-abcdef" session ...
# ...

# Attach to the test
playwright-cli attach tw-abcdef
```

Leave the test running in the background while you explore. The test starts paused, so step forward to the point where the failure happens, then diagnose from there.

Every action you run through `playwright-cli` prints the equivalent Playwright TypeScript. Copy that code back into the test. Usually you update a locator or an expectation; sometimes the app itself has the bug. Use your judgement.

After fixing the test, stop the background test run. Rerun to check that test passes.
