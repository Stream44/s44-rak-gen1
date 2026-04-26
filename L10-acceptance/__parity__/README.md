These JSON files are the committed parity oracle.
They capture the legacy `AcceptanceEngine.run()` `SuiteResult` output for the
three e-commerce acceptance suites before the walker body rewrite.
Captured on `2026-04-18T17:36:37Z` from commit `df324e32`
(`delete 27-projection/; migrate shared types + helpers into 27B`),
which is the last `30-acceptance.ts` commit before `8dd000e2`.
Each snapshot was normalized at capture time for timestamp and object-key order.
`acceptance-parity.test.ts` compares current normalized output against these files.
If parity fails, fix the current acceptance implementation rather than regenerating snapshots.
