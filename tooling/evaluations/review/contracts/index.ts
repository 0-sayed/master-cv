import type { TaskCase, TaskCategory, TaskContract } from "./types";
import { coverLetterContract } from "./cover-letter/contract";
import { interviewPrepContract } from "./interview-prep/contract";
import { jobEvidenceContract } from "./job-evidence/contract";
import { summaryContract } from "./summary/contract";
import { tailoringContract } from "./tailoring/contract";
import { translationContract } from "./translation/contract";

/** An isolated lookup lets controls inject a contract without registering test prompts in the study. */
export function createTaskRegistry(contracts: readonly TaskContract<TaskCase, unknown>[]) {
	const byCategory = new Map<TaskCategory, TaskContract<TaskCase, unknown>>();
	for (const contract of contracts) {
		if (byCategory.has(contract.category)) throw new Error(`TASK_CONTRACT_DUPLICATE: ${contract.category}`);
		byCategory.set(contract.category, contract);
	}
	return (category: TaskCategory): TaskContract<TaskCase, unknown> => {
		const contract = byCategory.get(category);
		if (!contract) throw new Error(`TASK_CONTRACT_NOT_FOUND: ${category}`);
		return contract;
	};
}

// Category tasks register their real contracts here after their own tests and controls pass.
// Runtime/verifier imports point back here; defer reading contract bindings until modules finish loading.
export const getTaskContract = (category: TaskCategory): TaskContract<TaskCase, unknown> =>
	createTaskRegistry([
		coverLetterContract,
		summaryContract,
		tailoringContract,
		jobEvidenceContract,
		interviewPrepContract,
		translationContract,
	])(category);
