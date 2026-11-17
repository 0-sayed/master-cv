# Testing backlog

## Account deletion cleanup deadline

CI run [43847075117](https://github.com/0-sayed/master-cv/actions/runs/43847075117), browser partition 3, reports one retry-only pass.
The private AI report remains after the existing 30-second deletion deadline in `ai-reports.spec.ts`.
Keep the original assertion and deadline. Capture queue state during the exact GitHub partition reproduction.
Status: root-cause investigation. No local browser partition runs under the owner heat limit.

The exact weighted partition passes all 97 tests without retry in run [43851127606](https://github.com/0-sayed/master-cv/actions/runs/43851127606).
The private report test completes in 5.5 seconds. Its attached queue shows deletion complete after one attempt, without a failure code.
The original retry-only failure is not reproduced. Its cause remains open, so this pass does not close the backlog item.
