# L07 Acceptance

`restartAfter: [n, ...]` is supported on acceptance scenarios.
The positions are 1-based trace step numbers, so `restartAfter: [1]`
means flush/dispose/reboot after step 1 and continue with step 2.

When the booted app exposes no restart surface, the engine treats
`restartAfter` as a no-op and continues in memory.
