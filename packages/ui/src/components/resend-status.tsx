import { Button } from "./button";
type ResendStatusProps = {
	remainingSeconds: number;
	pending: boolean;
	onResend: () => void;
	waitingLabel: (seconds: number) => string;
	availableLabel: string;
};
export function ResendStatus({ remainingSeconds, pending, onResend, waitingLabel, availableLabel }: ResendStatusProps) {
	const waiting = remainingSeconds > 0;
	return (
		<>
			<Button className="min-h-12" variant="link" disabled={waiting || pending} loading={pending} onClick={onResend}>
				{waiting ? waitingLabel(Math.ceil(remainingSeconds)) : availableLabel}
			</Button>
			<span role="status" className="sr-only">
				{waiting || pending ? "" : availableLabel}
			</span>
		</>
	);
}
