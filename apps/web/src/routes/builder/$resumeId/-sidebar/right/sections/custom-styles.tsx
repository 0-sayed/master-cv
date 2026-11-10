import { lazy, Suspense } from "react";
import { loadSkeletonModule } from "@reactive-resume/ui/components/skeleton";
import { SectionBase } from "../shared/section-base";
import { QuerySkeleton } from "@/components/query-skeleton";

const StylesheetEditorShell = lazy(() => loadSkeletonModule(() => import("@/features/resume/stylesheet/editor")));

export function CustomStylesSectionBuilder() {
	return (
		<SectionBase type="styles" className="space-y-4">
			<Suspense fallback={<QuerySkeleton shape="form" />}>
				<StylesheetEditorShell />
			</Suspense>
		</SectionBase>
	);
}
