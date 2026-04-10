import { MarkdownView, Plugin, TAbstractFile, TFile, parseLinktext } from "obsidian";

const HANDLED_LINK_CLASS = "gfm-anchor-compat-link";
const HANDLED_LINK_SELECTOR = `a.${HANDLED_LINK_CLASS}`;
const ANCHOR_LINK_SELECTOR = "a[href*='#'], a[data-href*='#']";
const TARGET_FILE_ATTRIBUTE = "data-gfm-anchor-target-file";
const TARGET_SLUG_ATTRIBUTE = "data-gfm-anchor-target-slug";
const HTML_ANCHOR_PATTERN = String.raw`<a\b[^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>`;
const PREVIEW_SCROLL_OPTIONS = {
	center: true,
	highlight: true
} as const;

interface AnchorTargetEntry
{
	line: number;
	slug: string;
}

interface DocumentIndex
{
	bySlug: Map<string, AnchorTargetEntry>;
}

interface LinkCandidate
{
	file: TFile;
	linkEl: HTMLElement;
	rawHref: string;
	slug: string;
}

interface PreviewRendererLike
{
	applyScroll?: (
		line: number,
		options?: {
			center?: boolean;
			highlight?: boolean;
		}
	) => void;
}

interface PreviewModeLike
{
	renderer?: PreviewRendererLike;
	applyScroll?: (scroll: number) => void;
}

export default class GfmAnchorCompatPlugin extends Plugin
{
	private readonly documentIndexCache = new Map<string, Promise<DocumentIndex>>();

	async onload(): Promise<void>
	{
		this.registerMarkdownPostProcessor(async (el, context) =>
		{
			await this.decorateRenderedMarkdown(el, context.sourcePath);
		});

		this.registerDomEvent(
			document,
			"click",
			(event) =>
			{
				void this.handleDocumentClick(event);
			},
			{ capture: true }
		);

		this.registerIndexInvalidationHandlers();
	}

	private registerIndexInvalidationHandlers(): void
	{
		const invalidate = (file: TAbstractFile): void =>
		{
			this.invalidateDocumentIndex(file);
		};

		this.registerEvent(this.app.vault.on("modify", invalidate));
		this.registerEvent(this.app.vault.on("delete", invalidate));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) =>
			{
				this.documentIndexCache.delete(oldPath);
				invalidate(file);
			})
		);
	}

	private async decorateRenderedMarkdown(el: HTMLElement, sourcePath: string): Promise<void>
	{
		const sourceFile = this.getFileByPath(sourcePath);

		if (!(sourceFile instanceof TFile))
			return;

		const linkCandidates = this.collectLinkCandidates(el, sourceFile.path);

		if (linkCandidates.length === 0)
			return;

		const documentIndexes = await this.getDocumentIndexes(linkCandidates);

		for (const candidate of linkCandidates)
		{
			const targetEntry = documentIndexes.get(candidate.file.path)?.bySlug.get(candidate.slug);

			if (!targetEntry)
				continue;

			this.decorateResolvedLink(candidate.linkEl, candidate.file, candidate.rawHref, targetEntry.slug);
		}
	}

	private collectLinkCandidates(el: HTMLElement, sourcePath: string): LinkCandidate[]
	{
		const linkCandidates: LinkCandidate[] = [];

		for (const linkEl of el.querySelectorAll(ANCHOR_LINK_SELECTOR))
		{
			if (!(linkEl instanceof HTMLElement) || linkEl.classList.contains(HANDLED_LINK_CLASS))
				continue;

			const linkCandidate = this.prepareLinkCandidate(linkEl, sourcePath);

			if (!linkCandidate)
				continue;

			linkCandidates.push(linkCandidate);
		}

		return linkCandidates;
	}

	private prepareLinkCandidate(linkEl: HTMLElement, sourcePath: string): LinkCandidate | null
	{
		const rawHref = this.readRawLink(linkEl);

		if (!rawHref || this.isExternalLink(rawHref))
			return null;

		const { path, subpath } = parseLinktext(rawHref);
		const decodedSubpath = this.safeDecode(subpath ?? "");

		if (!decodedSubpath.startsWith("#"))
			return null;

		const targetFile = this.resolveTargetFile(path, sourcePath);

		if (!(targetFile instanceof TFile))
			return null;

		const slug = this.normalizeSlug(decodedSubpath.slice(1));

		if (!slug)
			return null;

		return {
			file: targetFile,
			linkEl,
			rawHref,
			slug
		};
	}

	private async getDocumentIndexes(linkCandidates: LinkCandidate[]): Promise<Map<string, DocumentIndex>>
	{
		const uniqueFiles = new Map<string, TFile>();

		for (const candidate of linkCandidates)
		{
			if (!uniqueFiles.has(candidate.file.path))
				uniqueFiles.set(candidate.file.path, candidate.file);
		}

		const indexEntries = await Promise.all(
			Array.from(uniqueFiles.values(), async (file) =>
			{
				return [file.path, await this.getDocumentIndex(file)] as const;
			})
		);

		return new Map(indexEntries);
	}

	private decorateResolvedLink(linkEl: HTMLElement, targetFile: TFile, rawHref: string, slug: string): void
	{
		linkEl.setAttribute("href", rawHref);
		linkEl.removeAttribute("data-href");
		linkEl.classList.remove("internal-link", "is-unresolved");
		linkEl.classList.add(HANDLED_LINK_CLASS);
		linkEl.setAttribute(TARGET_FILE_ATTRIBUTE, targetFile.path);
		linkEl.setAttribute(TARGET_SLUG_ATTRIBUTE, slug);
	}

	private async handleDocumentClick(event: MouseEvent): Promise<void>
	{
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
			return;

		const rawTarget = event.target;

		if (!(rawTarget instanceof Element))
			return;

		const linkEl = rawTarget.closest(HANDLED_LINK_SELECTOR);

		if (!(linkEl instanceof HTMLElement))
			return;

		const targetPath = linkEl.getAttribute(TARGET_FILE_ATTRIBUTE);
		const targetSlug = linkEl.getAttribute(TARGET_SLUG_ATTRIBUTE);

		if (!targetPath || !targetSlug)
			return;

		const targetFile = this.getFileByPath(targetPath);

		if (!(targetFile instanceof TFile))
			return;

		const documentIndex = await this.getDocumentIndex(targetFile);
		const targetEntry = documentIndex.bySlug.get(targetSlug);

		if (!targetEntry)
			return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		const sourceView = this.findOwningView(linkEl);

		if (sourceView instanceof MarkdownView)
		{
			await this.navigateToLine(sourceView, targetFile, targetEntry.line);
			return;
		}

		const fallbackLeaf = this.app.workspace.getMostRecentLeaf();

		if (!fallbackLeaf)
			return;

		await fallbackLeaf.openFile(targetFile);

		if (fallbackLeaf.view instanceof MarkdownView)
			await this.navigateToLine(fallbackLeaf.view, targetFile, targetEntry.line);
	}

	private async navigateToLine(view: MarkdownView, targetFile: TFile, line: number): Promise<void>
	{
		const leaf = view.leaf;

		if (view.file?.path !== targetFile.path)
		{
			await leaf.openFile(targetFile);
			await leaf.loadIfDeferred();
		}

		if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== targetFile.path)
			return;

		if (leaf.view.getMode() === "source")
		{
			this.revealLineInEditor(leaf.view, line);
			return;
		}

		if (this.scrollPreviewToLine(leaf.view, line))
			return;

		this.revealLineInEditor(leaf.view, line);
	}

	private revealLineInEditor(view: MarkdownView, line: number): void
	{
		const from = { line, ch: 0 };
		const to = { line, ch: 0 };

		view.editor.setCursor(from);
		view.editor.scrollIntoView({ from, to }, true);
		view.editor.focus();
	}

	private scrollPreviewToLine(view: MarkdownView, line: number): boolean
	{
		const previewMode = getPreviewMode(view);
		const renderer = previewMode?.renderer;

		if (renderer?.applyScroll)
		{
			renderer.applyScroll(line, PREVIEW_SCROLL_OPTIONS);
			return true;
		}

		if (previewMode?.applyScroll)
		{
			previewMode.applyScroll(line);
			return true;
		}

		return false;
	}

	private findOwningView(element: HTMLElement): MarkdownView | null
	{
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (activeView?.containerEl.contains(element))
			return activeView;

		for (const leaf of this.app.workspace.getLeavesOfType("markdown"))
		{
			if (!(leaf.view instanceof MarkdownView))
				continue;

			if (leaf.view.containerEl.contains(element))
				return leaf.view;
		}

		return activeView;
	}

	private resolveTargetFile(linkPath: string, sourcePath: string): TFile | null
	{
		const decodedPath = this.safeDecode(linkPath);

		if (!decodedPath)
			return this.getFileByPath(sourcePath);

		return this.app.metadataCache.getFirstLinkpathDest(decodedPath, sourcePath) ?? this.getFileByPath(decodedPath);
	}

	private getDocumentIndex(file: TFile): Promise<DocumentIndex>
	{
		const cachedIndex = this.documentIndexCache.get(file.path);

		if (cachedIndex)
			return cachedIndex;

		const nextIndex = this.buildDocumentIndex(file);
		this.documentIndexCache.set(file.path, nextIndex);
		return nextIndex;
	}

	private async buildDocumentIndex(file: TFile): Promise<DocumentIndex>
	{
		const bySlug = new Map<string, AnchorTargetEntry>();
		const headingCounts = new Map<string, number>();
		const cache = this.app.metadataCache.getFileCache(file);

		for (const heading of cache?.headings ?? [])
		{
			const baseSlug = this.createGfmSlugBase(heading.heading);
			const seenCount = headingCounts.get(baseSlug) ?? 0;
			const slug = seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount}`;

			headingCounts.set(baseSlug, seenCount + 1);

			if (!bySlug.has(slug))
			{
				bySlug.set(slug, {
					line: heading.position.start.line,
					slug
				});
			}
		}

		const fileContent = await this.app.vault.cachedRead(file);
		this.addHtmlAnchorEntries(fileContent, bySlug);

		return {
			bySlug
		};
	}

	private addHtmlAnchorEntries(fileContent: string, bySlug: Map<string, AnchorTargetEntry>): void
	{
		const htmlAnchorRegex = createHtmlAnchorRegex();
		let scannedIndex = 0;
		let currentLine = 0;
		let match: RegExpExecArray | null;

		while ((match = htmlAnchorRegex.exec(fileContent)) !== null)
		{
			currentLine += countLineBreaks(fileContent, scannedIndex, match.index);
			scannedIndex = match.index;

			const rawId = match[1] ?? match[2] ?? match[3] ?? "";
			const slug = this.normalizeSlug(this.safeDecode(rawId));

			if (!slug)
				continue;

			bySlug.set(slug, {
				line: currentLine,
				slug
			});
		}
	}

	private createGfmSlugBase(heading: string): string
	{
		const normalizedHeading = heading
			.replace(/<[^>]+>/g, " ")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.trim()
			.toLowerCase()
			.replace(/[^\p{Letter}\p{Number}\s\-_]/gu, "")
			.replace(/\s+/gu, "-");

		return normalizedHeading || "section";
	}

	private normalizeSlug(slug: string): string
	{
		return slug.trim().toLowerCase();
	}

	private readRawLink(linkEl: HTMLElement): string | null
	{
		return linkEl.getAttribute("data-href") ?? linkEl.getAttribute("href");
	}

	private isExternalLink(link: string): boolean
	{
		return /^[a-z][a-z\d+\-.]*:/iu.test(link);
	}

	private getFileByPath(path: string): TFile | null
	{
		const file = this.app.vault.getAbstractFileByPath(path);

		return file instanceof TFile ? file : null;
	}

	private invalidateDocumentIndex(file: TAbstractFile): void
	{
		if (!(file instanceof TFile))
			return;

		this.documentIndexCache.delete(file.path);
	}

	private safeDecode(value: string): string
	{
		if (!value.includes("%"))
			return value;

		try
		{
			return decodeURIComponent(value);
		}
		catch
		{
			return value;
		}
	}
}

function getPreviewMode(view: MarkdownView): PreviewModeLike | null
{
	return (view.previewMode as PreviewModeLike | undefined) ?? null;
}

function createHtmlAnchorRegex(): RegExp
{
	return new RegExp(HTML_ANCHOR_PATTERN, "giu");
}

function countLineBreaks(text: string, start: number, end: number): number
{
	let lineBreaks = 0;

	for (let index = start; index < end; index++)
	{
		const charCode = text.charCodeAt(index);

		if (charCode === 10)
		{
			lineBreaks++;
			continue;
		}

		if (charCode !== 13)
			continue;

		lineBreaks++;

		if (index + 1 < end && text.charCodeAt(index + 1) === 10)
			index++;
	}

	return lineBreaks;
}
