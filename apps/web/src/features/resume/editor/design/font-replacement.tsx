import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { applyFontPairing, getRecommendedFontPairing } from "./presets";
import { ResumePreview } from "@/features/resume/preview/preview";

type Props = { data: ResumeData; onAccept: (before: ResumeData, after: ResumeData) => void };
export function FontReplacementNotice({ data, onAccept }: Props) {
	const [preview, setPreview] = useState<{ before: ResumeData; after: ResumeData } | null>(null);
	const [ready, setReady] = useState(false);
	const pairing = getRecommendedFontPairing(data);
	if (!pairing) return null;
	const recommended = pairing.body;
	return (
		<>
			<Alert variant="warn">
				<Icon name="warning" />
				<AlertTitle>
					<Trans>Review your document font</Trans>
				</AlertTitle>
				<AlertDescription>
					<Trans>This font can't display some of your text — switch to {recommended}?</Trans>
				</AlertDescription>
				<AlertActions>
					<Button
						variant="secondary"
						onClick={() => {
							const after = structuredClone(data);
							applyFontPairing(after.metadata, pairing.id);
							setReady(false);
							setPreview({ before: data, after });
						}}
					>
						<Trans>Preview replacement</Trans>
					</Button>
				</AlertActions>
			</Alert>
			<Dialog
				open={preview !== null}
				onOpenChange={(open) => {
					if (!open) setPreview(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Preview font replacement</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>Review the PDF before applying. Your text stays unchanged; you can undo the font change.</Trans>
						</DialogDescription>
					</DialogHeader>
					{preview && (
						<div className="overflow-auto">
							<ResumePreview
								data={preview.after}
								pageLayout="vertical"
								pageScale={0.45}
								onRender={() => setReady(true)}
							/>
						</div>
					)}
					{preview && preview.before !== data && (
						<Alert variant="warn">
							<AlertDescription>
								<Trans>The document changed. Close this preview and try again.</Trans>
							</AlertDescription>
						</Alert>
					)}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setPreview(null)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={!ready || !preview || preview.before !== data}
							onClick={() => {
								if (!ready || !preview || preview.before !== data) return;
								onAccept(preview.before, preview.after);
								setPreview(null);
							}}
						>
							<Trans>Use this font</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
