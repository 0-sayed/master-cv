import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CommandGroup, CommandItem, CommandShortcut } from "@reactive-resume/ui/components/command";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Kbd } from "@reactive-resume/ui/components/kbd";
import { useCommandPaletteStore } from "../store";
import { BaseCommandGroup } from "./base";
import { QueryListState } from "@/components/query-list-state";
import { useDialogStore } from "@/dialogs/store";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { orpc } from "@/libs/orpc/client";

type Application = RouterOutput["applications"]["list"][number];
type Thread = RouterOutput["agent"]["threads"]["list"][number];
type SearchPage = "resumes" | "applications" | "threads";

const isSearchPage = (page: string | undefined): page is SearchPage =>
	page === "resumes" || page === "applications" || page === "threads";

const matchesSearch = (search: string, values: Array<string | null | undefined>) => {
	const query = search.trim().toLowerCase();
	return !query || values.some((value) => value?.toLowerCase().includes(query));
};

export function ResumesCommandGroup() {
	const { session } = useRouteContext({ strict: false });
	const peekPage = useCommandPaletteStore((state) => state.peekPage);
	const pushPage = useCommandPaletteStore((state) => state.pushPage);

	const commandPage = peekPage();
	const searchPage = isSearchPage(commandPage) ? commandPage : undefined;

	if (!session) return null;

	return (
		<>
			<BaseCommandGroup heading={<Trans>Search for…</Trans>}>
				<CommandItem keywords={[t`Resumes`]} value="search.resumes" onSelect={() => pushPage("resumes")}>
					<Icon name="file-text" size={16} />
					<Trans>Resumes</Trans>
				</CommandItem>

				<CommandItem keywords={[t`Applications`]} value="search.applications" onSelect={() => pushPage("applications")}>
					<Icon name="briefcase" size={16} />
					<Trans>Applications</Trans>
				</CommandItem>

				<CommandItem
					keywords={[t`Conversations`, t`Assistant`, t`Threads`]}
					value="search.threads"
					onSelect={() => pushPage("threads")}
				>
					<Icon name="chat-text" size={16} />
					<Trans>Assistant conversations</Trans>
				</CommandItem>
			</BaseCommandGroup>

			{searchPage === "resumes" ? <ResumesPage /> : null}
			{searchPage === "applications" ? <ApplicationsPage /> : null}
			{searchPage === "threads" ? <ThreadsPage /> : null}
		</>
	);
}

function ResumesPage() {
	const navigate = useNavigate();
	const { openDialog } = useDialogStore();
	const reset = useCommandPaletteStore((state) => state.reset);
	const search = useCommandPaletteStore((state) => state.search);
	const query = useQuery(orpc.resume.list.queryOptions({ input: { sort: "lastUpdatedAt", tags: [] } }));
	const filteredResumes = (query.data ?? []).filter((resume) => matchesSearch(search, [resume.name, resume.slug]));

	const onCreate = () => {
		reset();
		openDialog("document.new", undefined);
	};

	const onNavigate = async (path: string) => {
		await navigate({ to: path });
		reset();
	};

	return (
		<CommandGroup forceMount heading={<Trans>Resumes</Trans>}>
			<CommandItem value="resumes.create" onSelect={onCreate}>
				<Icon name="plus" size={16} />
				<Trans>Create a new resume</Trans>
			</CommandItem>

			<QueryListState
				query={query}
				empty={filteredResumes.length === 0}
				loadingMessage={<Trans>Loading resumes…</Trans>}
				errorMessage={<Trans>Couldn't load this. Your saved data hasn't changed.</Trans>}
				emptyMessage={<Trans>No results found.</Trans>}
			>
				{filteredResumes.map((resume) => (
					<CommandItem
						key={resume.id}
						value={`resume.${resume.id}`}
						keywords={[resume.name, resume.slug]}
						onSelect={() => onNavigate(`/builder/${resume.id}`)}
					>
						<Icon name="file-text" size={16} />
						{resume.name}

						<CommandShortcut className="opacity-0 group-data-[selected=true]/command-item:opacity-100">
							<Trans comment="Command palette hint that pressing Enter opens the selected resume">
								Press <Kbd keys="Enter" /> to open
							</Trans>
						</CommandShortcut>
					</CommandItem>
				))}
			</QueryListState>
		</CommandGroup>
	);
}

function ApplicationsPage() {
	const navigate = useNavigate();
	const reset = useCommandPaletteStore((state) => state.reset);
	const search = useCommandPaletteStore((state) => state.search);
	const query = useQuery(applicationsListQueryOptions());
	const filteredApplications = (query.data ?? []).filter((application) =>
		matchesSearch(search, [application.company, application.role]),
	);

	const onCreateApplication = async () => {
		await navigate({ to: "/dashboard/applications", search: { create: true } });
		reset();
	};

	const onOpenApplication = async (application: Application) => {
		await navigate({
			to: "/dashboard/applications",
			search: { applicationId: application.id },
		});
		reset();
	};

	return (
		<CommandGroup forceMount heading={<Trans>Applications</Trans>}>
			<CommandItem value="applications.create" onSelect={onCreateApplication}>
				<Icon name="plus" size={16} />
				<Trans>New Application</Trans>
			</CommandItem>

			<QueryListState
				query={query}
				empty={filteredApplications.length === 0}
				loadingMessage={<Trans>Loading applications…</Trans>}
				errorMessage={<Trans>Couldn't load this. Your saved data hasn't changed.</Trans>}
				emptyMessage={<Trans>No results found.</Trans>}
			>
				{filteredApplications.map((application) => (
					<CommandItem
						key={application.id}
						value={`application.${application.id}`}
						keywords={[application.company, application.role]}
						onSelect={() => onOpenApplication(application)}
					>
						<Icon name="briefcase" size={16} />
						<span className="min-w-0 truncate">{application.company}</span>
						<span className="truncate type-metadata text-ink-3">{application.role}</span>
					</CommandItem>
				))}
			</QueryListState>
		</CommandGroup>
	);
}

function ThreadsPage() {
	const navigate = useNavigate();
	const reset = useCommandPaletteStore((state) => state.reset);
	const search = useCommandPaletteStore((state) => state.search);
	const query = useQuery(orpc.agent.threads.list.queryOptions());
	const filteredThreads = (query.data ?? [])
		.filter((thread) => thread.scope === "document")
		.filter((thread) => matchesSearch(search, [thread.title, thread.resumeName, thread.coverLetterName]));

	// A conversation opens its document with the assistant showing it.
	const onOpenThread = async (thread: Thread) => {
		if (thread.coverLetterId)
			await navigate({
				to: "/builder/letter/$coverLetterId",
				params: { coverLetterId: thread.coverLetterId },
				search: { assistant: thread.id },
			});
		else if (thread.workingResumeId)
			await navigate({
				to: "/builder/$resumeId",
				params: { resumeId: thread.workingResumeId },
				search: { assistant: thread.id },
			});
		reset();
	};

	return (
		<CommandGroup forceMount heading={<Trans>Assistant conversations</Trans>}>
			<QueryListState
				query={query}
				empty={filteredThreads.length === 0}
				loadingMessage={<Trans>Loading conversations…</Trans>}
				errorMessage={<Trans>Couldn't load this. Your saved data hasn't changed.</Trans>}
				emptyMessage={<Trans>No results found.</Trans>}
			>
				{filteredThreads.map((thread) => {
					const documentName = thread.coverLetterName ?? thread.resumeName ?? "";

					return (
						<CommandItem
							key={thread.id}
							value={`thread.${thread.id}`}
							keywords={[thread.title, documentName]}
							onSelect={() => onOpenThread(thread)}
						>
							<Icon name="chat-text" size={16} />
							<span className="min-w-0 truncate">{thread.title}</span>
							<span className="truncate type-metadata text-ink-3">{documentName}</span>
						</CommandItem>
					);
				})}
			</QueryListState>
		</CommandGroup>
	);
}
